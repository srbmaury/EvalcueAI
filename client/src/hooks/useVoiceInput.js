import { useState, useCallback, useContext, useEffect, useRef } from "react";
import api from "../api/axios";
import { AuthContext } from "../context/AuthContext";
import { chooseInterviewerGender, interviewerPitchForGender, selectInterviewerVoice } from "../utils/interviewerVoice";
import { mergeTranscriptText, sanitizeTranscriptSegment } from "../utils/transcriptSanitizer";
import { advanceVad, createVadState, VAD_DEFAULT_THRESHOLD } from "../utils/voiceActivityDetector";

const SpeechRecognitionCtor =
    typeof window !== "undefined"
        ? (window.SpeechRecognition || window.webkitSpeechRecognition || null)
        : null;

const HANDS_FREE_SEGMENT_MS = 20000;
const TRANSCRIPT_OVERLAP_WINDOW_MS = 2500;
// Hoisted so the default reference is stable across calls: an inline `{}` default is a new
// object literal every time the argument is omitted, which otherwise cascades through
// transcribeBlob -> startRecorderSegment -> startHandsFree/resumeHandsFree, making those
// callbacks unstable on every re-render of whichever component calls this hook without
// passing its own transcribeHeaders (e.g. the interview page re-rendering once a second for
// its elapsed-time display) — that instability can cancel an in-progress effect elsewhere
// (like OAForm's speak sequence) before it ever completes.
const EMPTY_TRANSCRIBE_HEADERS = {};

export const composeLiveTranscript = (finalText, interimText) => `${finalText || ""} ${interimText || ""}`.trim();

const safeTranscript = (value) => sanitizeTranscriptSegment(value);

/**
 * Voice input supports two modes:
 * 1. One-shot recording for written/OA answers.
 * 2. A hands-free interview session that keeps the microphone stream alive for
 *    the whole round while pausing transcription during interviewer speech.
 *
 * Browser speech recognition supplies low-latency live text when available.
 * MediaRecorder + server transcription is used as the fallback layer when the
 * browser did not already produce usable speech for that segment.
 */
export const useVoiceInput = ({ onTranscript, transcribeEndpoint = "/stt/transcribe", transcribeHeaders = EMPTY_TRANSCRIBE_HEADERS, enableServerTranscription = true, skipAuthRedirect = false }) => {
    const { user } = useContext(AuthContext);
    const [listening, setListening] = useState(false);
    const [listeningTarget, setListeningTarget] = useState(null);
    const [interimText, setInterimText] = useState("");
    const [micLevel, setMicLevel] = useState(0);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [speechThreshold, setSpeechThreshold] = useState(VAD_DEFAULT_THRESHOLD);
    const [noiseFloor, setNoiseFloor] = useState(null);
    const [micPermission, setMicPermission] = useState("unknown");
    const [inputDevices, setInputDevices] = useState([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState("default");
    const [micSessionActive, setMicSessionActive] = useState(false);
    const [handsFreePaused, setHandsFreePaused] = useState(false);

    const mediaRecorderRef = useRef(null);
    const liveRecRef = useRef(null);
    const liveRecRestartTimerRef = useRef(null);
    const recorderRotateTimerRef = useRef(null);
    const recorderStopReasonRef = useRef("manual");
    const sessionStreamRef = useRef(null);
    const handsFreeRef = useRef(false);
    const handsFreePausedRef = useRef(false);
    const activeTargetRef = useRef(null);
    const wsFinalsRef = useRef("");
    const wsInterimRef = useRef("");
    const liveTranscriptCommittedRef = useRef(false);
    const audioCtxRef = useRef(null);
    const analyserRef = useRef(null);
    const rafRef = useRef(null);
    const vadStateRef = useRef(createVadState());
    const interviewerGenderRef = useRef(null);
    const interviewerVoiceRef = useRef(null);
    const recentTranscriptRef = useRef({ target: null, text: "", at: 0 });
    const activeSpeechFinishRef = useRef(null);
    const rawOnTranscriptRef = useRef(onTranscript);
    const onTranscriptRef = useRef(onTranscript);

    useEffect(() => {
        rawOnTranscriptRef.current = onTranscript;
        onTranscriptRef.current = (target, value) => {
            const cleaned = safeTranscript(value);
            if (!cleaned) return;
            const now = Date.now();
            const previous = recentTranscriptRef.current;
            if (previous.target === target && previous.text && now - previous.at <= TRANSCRIPT_OVERLAP_WINDOW_MS) {
                const merged = mergeTranscriptText(previous.text, cleaned);
                const delta = merged.startsWith(previous.text)
                    ? merged.slice(previous.text.length).trim()
                    : cleaned;
                recentTranscriptRef.current = { target, text: merged, at: now };
                if (!delta) return;
                rawOnTranscriptRef.current?.(target, delta);
                return;
            }
            recentTranscriptRef.current = { target, text: cleaned, at: now };
            rawOnTranscriptRef.current?.(target, cleaned);
        };
    }, [onTranscript]);

    const supportsTTS = typeof window !== "undefined" && "speechSynthesis" in window;
    const supportsSTT = enableServerTranscription || Boolean(SpeechRecognitionCtor);

    useEffect(() => {
        const updateDevices = async () => {
            try {
                if (!navigator.mediaDevices?.enumerateDevices) return;
                const devs = await navigator.mediaDevices.enumerateDevices();
                setInputDevices(devs.filter((d) => d.kind === "audioinput").map((d) => ({ deviceId: d.deviceId, label: d.label })));
            } catch { void 0; }
        };
        updateDevices();
        try { navigator.mediaDevices?.addEventListener?.("devicechange", updateDevices); } catch { void 0; }
        try {
            if (navigator.permissions?.query) {
                navigator.permissions.query({ name: "microphone" }).then((status) => {
                    setMicPermission(status.state || "unknown");
                    status.onchange = () => setMicPermission(status.state || "unknown");
                }).catch(() => setMicPermission("unknown"));
            }
        } catch { setMicPermission("unknown"); }
        return () => {
            try { navigator.mediaDevices?.removeEventListener?.("devicechange", updateDevices); } catch { void 0; }
        };
    }, []);

    const constraintsForDevice = useCallback(() => selectedDeviceId && selectedDeviceId !== "default"
        ? { audio: { deviceId: { exact: selectedDeviceId } }, video: false }
        : { audio: true, video: false }, [selectedDeviceId]);

    const startMeter = useCallback((stream) => {
        if (!stream || audioCtxRef.current) return;
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            audioCtxRef.current = ctx;
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 1024;
            analyserRef.current = analyser;
            source.connect(analyser);
            const data = new Uint8Array(analyser.frequencyBinCount);
            vadStateRef.current = createVadState();
            const tick = () => {
                try {
                    analyser.getByteTimeDomainData(data);
                    let sum = 0;
                    for (let i = 0; i < data.length; i++) {
                        const v = (data[i] - 128) / 128;
                        sum += v * v;
                    }
                    const rms = Math.sqrt(sum / data.length);
                    const rawLevel = isFinite(rms) ? rms * 2 : 0;

                    const previous = vadStateRef.current;
                    const next = advanceVad(previous, rawLevel, Date.now());
                    vadStateRef.current = next;
                    setMicLevel(next.smoothedLevel);
                    if (next.speaking !== previous.speaking) setIsSpeaking(next.speaking);
                    if (next.noiseFloor !== null && previous.noiseFloor === null) {
                        setNoiseFloor(next.noiseFloor);
                        setSpeechThreshold(next.threshold);
                    }
                } catch { void 0; }
                rafRef.current = requestAnimationFrame(tick);
            };
            rafRef.current = requestAnimationFrame(tick);
        } catch { void 0; }
    }, []);

    const stopMeter = useCallback(() => {
        try { if (rafRef.current) cancelAnimationFrame(rafRef.current); } catch { void 0; }
        rafRef.current = null;
        try { analyserRef.current?.disconnect?.(); } catch { void 0; }
        analyserRef.current = null;
        try { audioCtxRef.current?.close?.(); } catch { void 0; }
        audioCtxRef.current = null;
        vadStateRef.current = createVadState();
        setMicLevel(0);
        setIsSpeaking(false);
        setSpeechThreshold(VAD_DEFAULT_THRESHOLD);
        setNoiseFloor(null);
    }, []);

    const clearRotateTimer = useCallback(() => {
        if (recorderRotateTimerRef.current) clearTimeout(recorderRotateTimerRef.current);
        recorderRotateTimerRef.current = null;
    }, []);

    const clearLiveRestartTimer = useCallback(() => {
        if (liveRecRestartTimerRef.current) clearTimeout(liveRecRestartTimerRef.current);
        liveRecRestartTimerRef.current = null;
    }, []);

    const pushTranscript = useCallback((target, text) => {
        const cleaned = safeTranscript(text);
        if (!cleaned) return false;
        onTranscriptRef.current?.(target, cleaned);
        return true;
    }, []);

    const commitLiveTranscript = useCallback((target = activeTargetRef.current) => {
        const text = safeTranscript(composeLiveTranscript(wsFinalsRef.current, wsInterimRef.current));
        if (!text) return false;
        liveTranscriptCommittedRef.current = true;
        wsFinalsRef.current = "";
        wsInterimRef.current = "";
        setInterimText("");
        onTranscriptRef.current?.(target, text);
        return true;
    }, []);

    const stopLiveRec = useCallback((expected = true) => {
        clearLiveRestartTimer();
        const rec = liveRecRef.current;
        if (rec) rec.__expectedStop = expected;
        try { rec?.stop(); } catch { void 0; }
        liveRecRef.current = null;
        setInterimText("");
    }, [clearLiveRestartTimer]);

    const startLiveRecognition = useCallback((target, restartable = false) => {
        if (!SpeechRecognitionCtor) return false;
        try {
            stopLiveRec(true);
            const rec = new SpeechRecognitionCtor();
            rec.__expectedStop = false;
            rec.lang = "en-US";
            rec.continuous = true;
            rec.interimResults = true;
            rec.onresult = (event) => {
                let finals = "";
                let interim = "";
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const text = event.results[i][0].transcript;
                    if (event.results[i].isFinal) finals += `${text} `;
                    else interim += text;
                }
                const finalText = safeTranscript(finals.trim());
                if (finalText) {
                    wsFinalsRef.current = `${wsFinalsRef.current} ${finalText}`.trim();
                    liveTranscriptCommittedRef.current = true;
                    onTranscriptRef.current?.(activeTargetRef.current || target, finalText);
                    wsFinalsRef.current = "";
                }
                wsInterimRef.current = interim;
                setInterimText(interim);
            };
            rec.onerror = (event) => {
                if (["not-allowed", "service-not-allowed", "audio-capture"].includes(event?.error)) setMicPermission("denied");
            };
            rec.onend = () => {
                setInterimText("");
                const expected = Boolean(rec.__expectedStop);
                if (restartable && !expected && handsFreeRef.current && !handsFreePausedRef.current) {
                    clearLiveRestartTimer();
                    liveRecRestartTimerRef.current = setTimeout(() => {
                        try {
                            rec.__expectedStop = false;
                            rec.start();
                            liveRecRef.current = rec;
                        } catch { void 0; }
                    }, 180);
                }
            };
            rec.start();
            liveRecRef.current = rec;
            return true;
        } catch {
            return false;
        }
    }, [clearLiveRestartTimer, stopLiveRec]);

    const transcribeBlob = useCallback(async (blob, target, browserCommitted) => {
        if (browserCommitted || !enableServerTranscription || !blob || blob.size <= 1000) return "";
        try {
            const form = new FormData();
            form.append("audio", blob, "audio.webm");
            const resp = await api.post(transcribeEndpoint, form, {
                skipAuthRedirect,
                headers: { "Content-Type": "multipart/form-data", ...transcribeHeaders },
            });
            const finalText = safeTranscript(resp?.data?.text || "");
            if (finalText) onTranscriptRef.current?.(target, finalText);
            return finalText;
        } catch (error) {
            console.warn("Server transcription failed, using browser transcript when available", error);
            return "";
        }
    }, [enableServerTranscription, skipAuthRedirect, transcribeEndpoint, transcribeHeaders]);

    const startRecorderSegment = useCallback((stream, target, rotate = false) => {
        if (!stream || typeof MediaRecorder === "undefined") return false;
        const existing = mediaRecorderRef.current;
        if (existing && existing.state !== "inactive") {
            existing.onstop = null;
            try { existing.stop(); } catch { void 0; }
        }
        let recorder;
        try { recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" }); }
        catch { try { recorder = new MediaRecorder(stream); } catch { return false; } }
        clearRotateTimer();
        const chunks = [];
        wsFinalsRef.current = "";
        wsInterimRef.current = "";
        liveTranscriptCommittedRef.current = false;
        recorderStopReasonRef.current = "manual";
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (event) => { if (event.data?.size > 0) chunks.push(event.data); };
        recorder.onstop = async () => {
            const reason = recorderStopReasonRef.current || "manual";
            const browserCommitted = liveTranscriptCommittedRef.current;
            await new Promise((resolve) => setTimeout(resolve, 120));
            const blob = new Blob(chunks, { type: "audio/webm" });
            const finalText = await transcribeBlob(blob, activeTargetRef.current || target, browserCommitted);
            if (!browserCommitted && !finalText) {
                const fallbackText = safeTranscript(composeLiveTranscript(wsFinalsRef.current, wsInterimRef.current));
                if (fallbackText) pushTranscript(activeTargetRef.current || target, fallbackText);
            }
            if (reason === "rotate" && handsFreeRef.current && !handsFreePausedRef.current && sessionStreamRef.current) {
                startRecorderSegment(sessionStreamRef.current, activeTargetRef.current || target, true);
                return;
            }
            // A newer recorder segment may already have replaced this one (e.g. pause
            // immediately followed by resume while this onstop's network transcription
            // was still in flight) — only touch shared state if we're still current.
            if (mediaRecorderRef.current !== recorder) return;
            mediaRecorderRef.current = null;
            setListening(false);
            if (!handsFreeRef.current) {
                setListeningTarget(null);
                try { stream.getTracks().forEach((track) => track.stop()); } catch { void 0; }
                stopMeter();
            }
        };
        recorder.start(250);
        if (rotate) {
            recorderRotateTimerRef.current = setTimeout(() => {
                if (mediaRecorderRef.current === recorder && recorder.state !== "inactive" && handsFreeRef.current && !handsFreePausedRef.current) {
                    recorderStopReasonRef.current = "rotate";
                    try { recorder.stop(); } catch { void 0; }
                }
            }, HANDS_FREE_SEGMENT_MS);
        }
        return true;
    }, [clearRotateTimer, pushTranscript, stopMeter, transcribeBlob]);

    const stopRecorder = useCallback((reason = "manual") => {
        clearRotateTimer();
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== "inactive") {
            recorderStopReasonRef.current = reason;
            try { recorder.stop(); } catch { void 0; }
        } else mediaRecorderRef.current = null;
    }, [clearRotateTimer]);

    const fallbackSTT = useCallback(async (target, { handsFree = false } = {}) => {
        try {
            activeTargetRef.current = target;
            wsFinalsRef.current = "";
            wsInterimRef.current = "";
            liveTranscriptCommittedRef.current = false;
            const started = startLiveRecognition(target, handsFree);
            if (!started) throw new Error("Web Speech not available");
            setListening(true);
            setListeningTarget(target);
            if (handsFree) {
                handsFreeRef.current = true;
                handsFreePausedRef.current = false;
                setHandsFreePaused(false);
                setMicSessionActive(true);
            }
        } catch (error) {
            console.debug("Web Speech start error", error);
            setListening(false);
            setListeningTarget(null);
            if (handsFree) setMicSessionActive(false);
        }
    }, [startLiveRecognition]);

    const startListening = useCallback(async (target) => {
        if (!supportsSTT) return;
        if (handsFreeRef.current) {
            activeTargetRef.current = target;
            setListeningTarget(target);
            if (handsFreePausedRef.current) {
                handsFreePausedRef.current = false;
                setHandsFreePaused(false);
                if (sessionStreamRef.current) {
                    startLiveRecognition(target, true);
                    startRecorderSegment(sessionStreamRef.current, target, true);
                    setListening(true);
                } else await fallbackSTT(target, { handsFree: true });
            }
            return;
        }
        if (!enableServerTranscription && SpeechRecognitionCtor) return fallbackSTT(target);
        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraintsForDevice());
            activeTargetRef.current = target;
            const recorderStarted = startRecorderSegment(stream, target, false);
            if (!recorderStarted && SpeechRecognitionCtor) {
                stream.getTracks().forEach((track) => track.stop());
                return fallbackSTT(target);
            }
            startLiveRecognition(target, false);
            setListening(true);
            setListeningTarget(target);
            setMicPermission("granted");
            startMeter(stream);
        } catch (error) {
            console.debug("getUserMedia failed, falling back to Web Speech", error);
            if (SpeechRecognitionCtor) await fallbackSTT(target);
            else setMicPermission("denied");
        }
    }, [constraintsForDevice, enableServerTranscription, fallbackSTT, startLiveRecognition, startMeter, startRecorderSegment, supportsSTT]);

    const startHandsFree = useCallback(async (target) => {
        if (!supportsSTT || target === null || target === undefined) return false;
        activeTargetRef.current = target;
        if (handsFreeRef.current) {
            setListeningTarget(target);
            if (handsFreePausedRef.current) {
                handsFreePausedRef.current = false;
                setHandsFreePaused(false);
                if (sessionStreamRef.current) {
                    startLiveRecognition(target, true);
                    startRecorderSegment(sessionStreamRef.current, target, true);
                    setListening(true);
                } else await fallbackSTT(target, { handsFree: true });
            }
            return true;
        }

        handsFreeRef.current = true;
        handsFreePausedRef.current = false;
        setHandsFreePaused(false);
        try {
            if (!enableServerTranscription && SpeechRecognitionCtor) {
                await fallbackSTT(target, { handsFree: true });
                return true;
            }
            const stream = await navigator.mediaDevices.getUserMedia(constraintsForDevice());
            sessionStreamRef.current = stream;
            setMicPermission("granted");
            setMicSessionActive(true);
            setListeningTarget(target);
            startMeter(stream);
            if (handsFreePausedRef.current) {
                // A pause (e.g. the interviewer started speaking) was requested while the
                // permission prompt/getUserMedia call was still pending. Keep the stream
                // open for a later resume, but don't start capturing over that speech.
                return true;
            }
            startLiveRecognition(target, true);
            if (!startRecorderSegment(stream, target, true) && !SpeechRecognitionCtor) throw new Error("No supported speech recorder");
            setListening(true);
            return true;
        } catch (error) {
            console.debug("Hands-free microphone start failed", error);
            try { sessionStreamRef.current?.getTracks?.().forEach((track) => track.stop()); } catch { void 0; }
            sessionStreamRef.current = null;
            stopMeter();
            handsFreeRef.current = false;
            handsFreePausedRef.current = false;
            setMicSessionActive(false);
            setHandsFreePaused(false);
            if (SpeechRecognitionCtor) {
                await fallbackSTT(target, { handsFree: true });
                return true;
            }
            setMicPermission("denied");
            return false;
        }
    }, [constraintsForDevice, enableServerTranscription, fallbackSTT, startLiveRecognition, startMeter, startRecorderSegment, stopMeter, supportsSTT]);

    const pauseHandsFree = useCallback(async () => {
        if (!handsFreeRef.current) return;
        handsFreePausedRef.current = true;
        setHandsFreePaused(true);
        commitLiveTranscript(activeTargetRef.current);
        stopLiveRec(true);
        stopRecorder("pause");
        setListening(false);
        setInterimText("");
    }, [commitLiveTranscript, stopLiveRec, stopRecorder]);

    const resumeHandsFree = useCallback(async (target = activeTargetRef.current) => {
        if (!handsFreeRef.current || target === null || target === undefined || !supportsSTT) return false;
        activeTargetRef.current = target;
        setListeningTarget(target);
        if (!handsFreePausedRef.current) return true;
        handsFreePausedRef.current = false;
        setHandsFreePaused(false);
        if (sessionStreamRef.current) {
            startLiveRecognition(target, true);
            startRecorderSegment(sessionStreamRef.current, target, true);
            setListening(true);
            return true;
        }
        await fallbackSTT(target, { handsFree: true });
        return true;
    }, [fallbackSTT, startLiveRecognition, startRecorderSegment, supportsSTT]);

    const stopHandsFree = useCallback(() => {
        if (!handsFreeRef.current && !sessionStreamRef.current) return;
        handsFreeRef.current = false;
        handsFreePausedRef.current = true;
        setHandsFreePaused(false);
        commitLiveTranscript(activeTargetRef.current);
        stopLiveRec(true);
        stopRecorder("shutdown");
        try { sessionStreamRef.current?.getTracks?.().forEach((track) => track.stop()); } catch { void 0; }
        sessionStreamRef.current = null;
        activeTargetRef.current = null;
        setMicSessionActive(false);
        setListening(false);
        setListeningTarget(null);
        setInterimText("");
        stopMeter();
    }, [commitLiveTranscript, stopLiveRec, stopMeter, stopRecorder]);

    const stopListening = useCallback(() => {
        if (handsFreeRef.current) { pauseHandsFree(); return; }
        commitLiveTranscript(listeningTarget || activeTargetRef.current);
        stopLiveRec(true);
        stopRecorder("manual");
        setListening(false);
        setListeningTarget(null);
        stopMeter();
    }, [commitLiveTranscript, listeningTarget, pauseHandsFree, stopLiveRec, stopMeter, stopRecorder]);

    const retargetListening = useCallback((target) => {
        if (target === null || target === undefined) return;
        activeTargetRef.current = target;
        if (listening || handsFreeRef.current) setListeningTarget(target);
    }, [listening]);

    const speakNow = useCallback((text) => new Promise((resolve) => {
        let timeoutId;
        let speakingPollId;
        let settled = false;
        let observedSpeaking = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            if (timeoutId) clearTimeout(timeoutId);
            if (speakingPollId) clearInterval(speakingPollId);
            if (activeSpeechFinishRef.current === finish) activeSpeechFinishRef.current = null;
            resolve(value);
        };
        try {
            if (!supportsTTS || !text) { finish(false); return; }
            activeSpeechFinishRef.current?.(false);
            activeSpeechFinishRef.current = finish;
            window.speechSynthesis.cancel();
            window.speechSynthesis.resume?.();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 0.95;
            const preference = ["male", "female"].includes(user?.interviewerVoicePreference)
                ? user.interviewerVoicePreference
                : "random";
            const gender = interviewerGenderRef.current || (preference === "random" ? chooseInterviewerGender() : preference);
            interviewerGenderRef.current = gender;
            utterance.pitch = interviewerPitchForGender(gender);
            const voices = window.speechSynthesis.getVoices();
            let preferred = interviewerVoiceRef.current;
            if (!preferred || !voices.some((voice) => voice.voiceURI === preferred.voiceURI)) {
                preferred = selectInterviewerVoice(voices, gender);
                interviewerVoiceRef.current = preferred;
            }
            if (preferred) utterance.voice = preferred;
            utterance.onstart = () => { observedSpeaking = true; };
            utterance.onend = () => finish(true);
            utterance.onerror = () => finish(false);
            const estimatedSpeechMs = Math.ceil(String(text).length / 12 * 1000);
            timeoutId = setTimeout(() => {
                try { window.speechSynthesis.cancel(); } catch { void 0; }
                finish(false);
            }, Math.min(90000, Math.max(5000, estimatedSpeechMs + 5000)));
            speakingPollId = setInterval(() => {
                const speaking = window.speechSynthesis?.speaking;
                if (speaking === true) observedSpeaking = true;
                else if (observedSpeaking && speaking === false) finish(true);
            }, 250);
            window.speechSynthesis.speak(utterance);
        } catch (error) {
            console.warn("speakNow error", error);
            finish(false);
        }
    }), [supportsTTS, user?.interviewerVoicePreference]);

    useEffect(() => () => {
        activeSpeechFinishRef.current?.(false);
        activeSpeechFinishRef.current = null;
        try { window.speechSynthesis?.cancel?.(); } catch { void 0; }
        handsFreeRef.current = false;
        handsFreePausedRef.current = true;
        clearRotateTimer();
        clearLiveRestartTimer();
        try { if (liveRecRef.current) liveRecRef.current.__expectedStop = true; liveRecRef.current?.stop?.(); } catch { void 0; }
        try { mediaRecorderRef.current?.stop?.(); } catch { void 0; }
        try { sessionStreamRef.current?.getTracks?.().forEach((track) => track.stop()); } catch { void 0; }
        try { if (rafRef.current) cancelAnimationFrame(rafRef.current); } catch { void 0; }
        try { audioCtxRef.current?.close?.(); } catch { void 0; }
    }, [clearLiveRestartTimer, clearRotateTimer]);

    return {
        listening, listeningTarget, interimText,
        micLevel, isSpeaking, speechThreshold, noiseFloor,
        micPermission, micSessionActive, handsFreePaused,
        inputDevices, selectedDeviceId, setSelectedDeviceId,
        supportsSTT, supportsTTS,
        startListening, stopListening, retargetListening, speakNow,
        startHandsFree, pauseHandsFree, resumeHandsFree, stopHandsFree,
    };
};
