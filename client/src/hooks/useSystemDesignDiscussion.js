import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api/axios";

const DEFAULT_INTERVAL_MS = 7000;
const MIN_CONTEXT_CHARS = 80;
const MIN_NEW_CHARS = 35;
const FIRST_INTERACTION_CONTEXT_CHARS = 140;
export const CANDIDATE_SILENCE_MS = 15000;
const SILENCE_POLL_MS = 500;
const SPEECH_LEVEL_THRESHOLD = 0.035;

const looksLikeCandidateQuestion = (value = "") => {
    const tail = value.trim().slice(-180);
    if (tail.length < 12) return false;
    if (tail.endsWith("?")) return true;
    return /\b(what|which|how|when|where|who)\b|\b(should|can|could|would)\s+(i|we)\b|\b(do|are|is)\s+(we|there|it)\b/i.test(tail);
};

/**
 * Gives the AI interviewer regular opportunities to participate in a live
 * system-design discussion. Candidate activity is based on committed transcript,
 * interim speech and microphone energy so a long spoken sentence is never
 * mistaken for silence while STT is waiting to commit text.
 */
export const useSystemDesignDiscussion = ({
    enabled,
    endpoint,
    headers = {},
    // Extra request fields, e.g. the candidate attempt's roundIndex/questionIndex.
    body = null,
    transcript = "",
    diagramData = "",
    interimText = "",
    micLevel = 0,
    isSpeaking,
    listening = false,
    interviewerSpeaking = false,
    onInterjection,
    skipAuthRedirect = false,
    intervalMs = DEFAULT_INTERVAL_MS,
}) => {
    const [interjections, setInterjections] = useState([]);
    const [checking, setChecking] = useState(false);
    const busyRef = useRef(false);
    const lastCheckedLengthRef = useRef(0);
    const lastCheckedAtRef = useRef(0);
    const lastCandidateActivityAtRef = useRef(Date.now());
    const lastSilenceAttemptAtRef = useRef(0);
    const lastObservedTranscriptRef = useRef(transcript || "");
    const lastObservedInterimRef = useRef(interimText || "");
    const wasInterviewerSpeakingRef = useRef(Boolean(interviewerSpeaking));
    const transcriptRef = useRef(transcript);
    const diagramRef = useRef(diagramData);
    const interjectionsRef = useRef(interjections);
    const onInterjectionRef = useRef(onInterjection);
    const interviewerSpeakingRef = useRef(Boolean(interviewerSpeaking));

    const markCandidateTurnStart = useCallback(() => {
        const now = Date.now();
        lastCandidateActivityAtRef.current = now;
        lastSilenceAttemptAtRef.current = 0;
    }, []);

    useEffect(() => {
        transcriptRef.current = transcript;
        const current = transcript || "";
        if (current !== lastObservedTranscriptRef.current) {
            lastObservedTranscriptRef.current = current;
            markCandidateTurnStart();
        }
    }, [markCandidateTurnStart, transcript]);

    useEffect(() => {
        const current = interimText || "";
        if (listening && current && current !== lastObservedInterimRef.current) {
            lastObservedInterimRef.current = current;
            markCandidateTurnStart();
        } else if (!current) {
            lastObservedInterimRef.current = "";
        }
    }, [interimText, listening, markCandidateTurnStart]);

    useEffect(() => {
        // Same calibrated/hysteresis signal ConversationalPanel prefers; falls back to a raw
        // threshold only when a caller doesn't pass isSpeaking (e.g. existing tests).
        const hasVoiceEnergy = isSpeaking !== undefined ? isSpeaking : Number(micLevel) >= SPEECH_LEVEL_THRESHOLD;
        if (listening && hasVoiceEnergy) markCandidateTurnStart();
    }, [isSpeaking, listening, markCandidateTurnStart, micLevel]);

    useEffect(() => {
        interviewerSpeakingRef.current = Boolean(interviewerSpeaking);
        if (wasInterviewerSpeakingRef.current && !interviewerSpeaking) {
            // The candidate's 15-second thinking/speaking window begins only
            // after the interviewer has completely finished talking.
            markCandidateTurnStart();
        }
        wasInterviewerSpeakingRef.current = Boolean(interviewerSpeaking);
    }, [interviewerSpeaking, markCandidateTurnStart]);

    useEffect(() => { diagramRef.current = diagramData; }, [diagramData]);
    const bodyRef = useRef(body);
    useEffect(() => { bodyRef.current = body; }, [body]);
    useEffect(() => { interjectionsRef.current = interjections; }, [interjections]);
    useEffect(() => { onInterjectionRef.current = onInterjection; }, [onInterjection]);

    const checkpoint = useCallback(async ({ force = false, dueToSilence = false } = {}) => {
        if (!enabled || !endpoint || busyRef.current || interviewerSpeakingRef.current) return null;
        if (typeof document !== "undefined" && document.hidden) return null;
        const currentTranscript = (transcriptRef.current || "").trim();
        const now = Date.now();
        const newChars = currentTranscript.length - lastCheckedLengthRef.current;
        const previousInterjections = interjectionsRef.current;
        const candidateAskedQuestion = newChars >= 12 && looksLikeCandidateQuestion(currentTranscript);
        const needsFirstInteraction = previousInterjections.length === 0 && currentTranscript.length >= FIRST_INTERACTION_CONTEXT_CHARS;
        const candidateSilent = dueToSilence || (
            now - lastCandidateActivityAtRef.current >= CANDIDATE_SILENCE_MS
            && now - lastSilenceAttemptAtRef.current >= CANDIDATE_SILENCE_MS
        );
        const forceInteraction = force || candidateAskedQuestion || needsFirstInteraction || candidateSilent;

        if (!forceInteraction) {
            if (currentTranscript.length < MIN_CONTEXT_CHARS) return null;
            if (newChars < MIN_NEW_CHARS) return null;
            if (now - lastCheckedAtRef.current < Math.max(3500, intervalMs - 1500)) return null;
        }

        if (candidateSilent) lastSilenceAttemptAtRef.current = now;
        busyRef.current = true;
        setChecking(true);
        lastCheckedLengthRef.current = currentTranscript.length;
        lastCheckedAtRef.current = now;
        try {
            const { data } = await api.post(endpoint, {
                ...(bodyRef.current || {}),
                transcript: currentTranscript.slice(-20000),
                diagramData: (diagramRef.current || "").slice(0, 500000),
                previousInterjections: previousInterjections.map((item) => item.text).slice(-8),
                forceInteraction,
                candidateAskedQuestion,
            }, { headers, skipAuthRedirect });
            if (data?.shouldInterrupt && data?.interjection) {
                const item = {
                    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    text: data.interjection,
                    kind: data.kind || "challenge",
                    at: new Date().toISOString(),
                    candidateTranscript: currentTranscript,
                };
                setInterjections((current) => [...current, item].slice(-12));
                await onInterjectionRef.current?.(item);
                // onInterjection includes TTS. Start the silence window only after
                // the interviewer has actually finished speaking.
                markCandidateTurnStart();
                return item;
            }
            return null;
        } catch (error) {
            console.debug("System design checkpoint skipped", error?.message || error);
            return null;
        } finally {
            busyRef.current = false;
            setChecking(false);
        }
    }, [enabled, endpoint, headers, intervalMs, markCandidateTurnStart, skipAuthRedirect]);

    useEffect(() => {
        if (!enabled || !endpoint) return undefined;
        const timer = window.setInterval(() => { checkpoint(); }, Math.max(5000, intervalMs));
        return () => window.clearInterval(timer);
    }, [checkpoint, enabled, endpoint, intervalMs]);

    useEffect(() => {
        if (!enabled || !endpoint) return undefined;
        const timer = window.setInterval(() => {
            const now = Date.now();
            if (
                !busyRef.current
                && !interviewerSpeakingRef.current
                && now - lastCandidateActivityAtRef.current >= CANDIDATE_SILENCE_MS
                && now - lastSilenceAttemptAtRef.current >= CANDIDATE_SILENCE_MS
            ) {
                checkpoint({ force: true, dueToSilence: true });
            }
        }, SILENCE_POLL_MS);
        return () => window.clearInterval(timer);
    }, [checkpoint, enabled, endpoint]);

    useEffect(() => {
        if (enabled) {
            markCandidateTurnStart();
            lastObservedTranscriptRef.current = transcriptRef.current || "";
            lastObservedInterimRef.current = "";
            return;
        }
        setInterjections([]);
        lastCheckedLengthRef.current = 0;
        lastCheckedAtRef.current = 0;
        lastSilenceAttemptAtRef.current = 0;
    }, [enabled, markCandidateTurnStart]);

    return { interjections, checking, checkpoint, markCandidateTurnStart };
};

export default useSystemDesignDiscussion;
