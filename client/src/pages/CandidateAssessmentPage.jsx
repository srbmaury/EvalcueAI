import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import {
    Alert, Box, Button, Checkbox, Chip, CircularProgress, Container,
    Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Link, Paper, Stack, TextField, Typography,
} from "@mui/material";
import { CheckCircleOutlineRounded, ErrorOutlineRounded } from "@mui/icons-material";
import api from "../api/axios";
import CandidateDebuggingRound from "../components/CandidateDebuggingRound";
import CodeEditorField from "../components/CodeEditorField";
import ConversationalPanel from "../components/ConversationalPanel";
import SystemDesignDiscussionPanel from "../components/SystemDesignDiscussionPanel";
import VoiceControls from "../components/VoiceControls";
import WebcamPreview from "../components/WebcamPreview";
import { useVoiceInput } from "../hooks/useVoiceInput";
import { useNotify } from "../context/NotificationContext";
import {
    completedQuestionCount,
    firstIncompleteQuestionIndex,
    pendingFollowUpFor,
    roundComplete,
} from "../utils/candidateAssessmentProgress";
import { canStartHiringAssessment, integrityRecoveryReason } from "../utils/hiringIntegrityPolicy";
import { candidateTranscriptionConfig } from "../utils/hiringVoicePolicy";
import { formatAssessmentDateTime } from "../utils/hiringAssessmentPayload";
import { describeError } from "../utils/errorFormatter";

const readSavedAttempt = (key) => { try { return JSON.parse(window.localStorage?.getItem(key) || "null"); } catch { return null; } };
const writeSavedAttempt = (key, value) => { try { window.localStorage?.setItem(key, JSON.stringify(value)); } catch { /* local recovery is best effort */ } };
const removeSavedAttempt = (key) => { try { window.localStorage?.removeItem(key); } catch { /* no-op */ } };

const formatTime = (seconds) => {
    const safe = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

export default function CandidateAssessmentPage() {
    const { shareToken } = useParams();
    const invitationId = useMemo(() => new URLSearchParams(window.location.search).get("invite") || "", []);
    const storageKey = useMemo(() => `assessment-attempt:${shareToken}:${invitationId || "open"}`, [invitationId, shareToken]);
    const notify = useNotify();

    const [assessment, setAssessment] = useState(null);
    const [attempt, setAttempt] = useState(null);
    const [attemptToken, setAttemptToken] = useState("");
    const [identity, setIdentity] = useState({ name: "", email: "" });
    const [emailLocked, setEmailLocked] = useState(false);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [submitted, setSubmitted] = useState(false);
    const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
    const [consent, setConsent] = useState(false);
    const [integrityConsent, setIntegrityConsent] = useState(false);
    const [cameraReady, setCameraReady] = useState(false);
    const [micReady, setMicReady] = useState(false);
    const [online, setOnline] = useState(navigator.onLine);
    const [dirty, setDirty] = useState({});
    const [lastSavedAt, setLastSavedAt] = useState(null);
    const [restoreNotice, setRestoreNotice] = useState("");
    const [faceStatus, setFaceStatus] = useState("off");
    const [roundCameraOn, setRoundCameraOn] = useState(false);
    const [fullscreenActive, setFullscreenActive] = useState(Boolean(document.fullscreenElement));
    const [activeRoundIndex, setActiveRoundIndex] = useState(0);
    const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
    const [roundTransition, setRoundTransition] = useState(null);
    const [codingEnabled, setCodingEnabled] = useState(false);
    const [spokenNotes, setSpokenNotes] = useState({});
    const [focusedField, setFocusedField] = useState("answer");
    const [clockNow, setClockNow] = useState(Date.now());
    const [oaSpeaking, setOaSpeaking] = useState(false);

    const focusedVoiceTargetRef = useRef("");
    const diagramSceneRef = useRef("");
    const oaSpokenQuestionKeysRef = useRef(new Set());
    const oaRoundIntroducedRef = useRef(false);

    const onTranscript = useCallback((target, text) => {
        if (window.speechSynthesis?.speaking) return;
        target = focusedVoiceTargetRef.current || target;
        const [prefix, roundValue, questionValue, field = "answer"] = String(target).split(":");
        if (prefix !== "candidate") return;
        const roundIndex = Number(roundValue);
        const questionIndex = Number(questionValue);
        const baseTarget = `candidate:${roundIndex}:${questionIndex}`;
        if (field === "spoken") {
            setSpokenNotes((current) => ({ ...current, [baseTarget]: `${current[baseTarget] || ""}${current[baseTarget] ? " " : ""}${text}` }));
            setDirty((current) => ({ ...current, [`${roundIndex}:${questionIndex}:answer`]: true }));
            return;
        }
        const key = field === "followup" ? "followUpAnswer" : "answer";
        setDirty((current) => ({ ...current, [`${roundIndex}:${questionIndex}:${field === "followup" ? "followup" : "answer"}`]: true }));
        setAttempt((current) => current ? ({
            ...current,
            rounds: current.rounds.map((round, ri) => ri === roundIndex ? {
                ...round,
                questions: round.questions.map((question, qi) => qi === questionIndex
                    ? { ...question, [key]: `${question[key] || ""}${question[key] ? " " : ""}${text}` }
                    : question),
            } : round),
        }) : current);
    }, []);

    const candidateToolHeaders = useMemo(() => attemptToken ? { "X-Attempt-Token": attemptToken } : {}, [attemptToken]);
    const candidateToolBase = attempt ? `/assessments/public/${shareToken}/attempts/${attempt._id}` : "";
    const transcriptionConfig = useMemo(() => candidateTranscriptionConfig({
        shareToken,
        attemptId: attempt?._id,
        attemptToken,
        capabilities: assessment?.capabilities || {},
    }), [assessment?.capabilities, attempt?._id, attemptToken, shareToken]);
    const {
        listening, listeningTarget, interimText, micLevel, isSpeaking, micPermission, micSessionActive, handsFreePaused,
        inputDevices, selectedDeviceId, setSelectedDeviceId, supportsSTT, supportsTTS,
        startListening, stopListening, retargetListening, speakNow,
        startHandsFree, pauseHandsFree, resumeHandsFree, stopHandsFree,
    } = useVoiceInput({
        onTranscript,
        transcribeEndpoint: transcriptionConfig.endpoint || "/stt/transcribe",
        transcribeHeaders: transcriptionConfig.headers,
        enableServerTranscription: transcriptionConfig.enabled,
        skipAuthRedirect: true,
    });

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get(`/assessments/public/${shareToken}`, { params: invitationId ? { invite: invitationId } : undefined });
                setAssessment(data);
                if (invitationId) {
                    try {
                        const { data: invite } = await api.get(`/assessments/public/${shareToken}/invitation/${invitationId}`, { skipAuthRedirect: true });
                        setIdentity({ name: invite?.name || "", email: invite?.email || "" });
                        setEmailLocked(Boolean(invite?.emailLocked && invite?.email));
                    } catch { /* manual identity remains available */ }
                }
                const saved = readSavedAttempt(storageKey);
                if (saved?.attempt && saved?.attemptToken) {
                    setAttempt(saved.attempt);
                    setAttemptToken(saved.attemptToken);
                    setDirty(saved.dirty || {});
                    setLastSavedAt(saved.savedAt || null);
                    setActiveRoundIndex(Math.max(0, Number(saved.navigation?.activeRoundIndex) || 0));
                    setActiveQuestionIndex(Math.max(0, Number(saved.navigation?.activeQuestionIndex) || 0));
                    setRoundTransition(saved.navigation?.roundTransition || null);
                    setRestoreNotice("We found a saved attempt on this device. Continue from where you left off, or start over if this is not your attempt.");
                }
            } catch {
                setError("This assessment link is invalid, closed, or expired.");
            } finally {
                setLoading(false);
            }
        })();
    }, [invitationId, shareToken, storageKey]);

    const persist = useCallback((nextAttempt, token = attemptToken, nextDirty = dirty) => {
        const savedAt = new Date().toISOString();
        setAttempt(nextAttempt);
        setLastSavedAt(savedAt);
        writeSavedAttempt(storageKey, {
            attempt: nextAttempt,
            attemptToken: token,
            dirty: nextDirty,
            identity,
            invitationId,
            savedAt,
            navigation: { activeRoundIndex, activeQuestionIndex, roundTransition },
        });
    }, [activeQuestionIndex, activeRoundIndex, attemptToken, dirty, identity, invitationId, roundTransition, storageKey]);

    useEffect(() => {
        if (!attempt || !attemptToken) return;
        const savedAt = new Date().toISOString();
        writeSavedAttempt(storageKey, { attempt, attemptToken, dirty, identity, invitationId, savedAt, navigation: { activeRoundIndex, activeQuestionIndex, roundTransition } });
        setLastSavedAt(savedAt);
    }, [activeQuestionIndex, activeRoundIndex, attempt, attemptToken, dirty, identity, invitationId, roundTransition, storageKey]);

    useEffect(() => {
        const update = () => setOnline(navigator.onLine);
        window.addEventListener("online", update);
        window.addEventListener("offline", update);
        return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
    }, []);

    useEffect(() => {
        if (!attempt?.startedAt) return undefined;
        const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [attempt?.startedAt]);

    const enterFullscreen = useCallback(async () => {
        if (document.fullscreenElement) { setFullscreenActive(true); return true; }
        if (!document.documentElement.requestFullscreen) { setFullscreenActive(false); return false; }
        try { await document.documentElement.requestFullscreen(); setFullscreenActive(true); return true; }
        catch { setFullscreenActive(false); return false; }
    }, []);

    const start = async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
            const fullscreenReady = assessment.integrity?.requireFullscreen ? await enterFullscreen() : true;
            if (!canStartHiringAssessment({ integrity: assessment.integrity, cameraReady, fullscreenActive: fullscreenReady })) {
                const message = !cameraReady && assessment.integrity?.requireCamera
                    ? "Camera access is required before this assessment can start."
                    : "Fullscreen is required before this assessment can start.";
                setError(message);
                notify(message, "warning");
                return;
            }
            const { data } = await api.post(`/assessments/public/${shareToken}/start`, {
                ...identity,
                privacyConsent: consent,
                integrityConsent,
                ...(invitationId ? { invitationId } : {}),
            }, { skipAuthRedirect: true });
            setAttemptToken(data.attemptToken);
            setActiveRoundIndex(0);
            setActiveQuestionIndex(0);
            setRoundTransition(null);
            setRestoreNotice("");
            persist(data.attempt, data.attemptToken, {});
        } catch (err) {
            if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
            const message = describeError(err, "We couldn’t start your assessment.");
            setError(message);
            notify(message, "error");
        } finally { setBusy(false); }
    };

    const checkCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            stream.getTracks().forEach((track) => track.stop());
            setCameraReady(true);
            setError("");
            notify("Camera is ready.", "success");
        } catch {
            const message = "Camera access is required for this assessment. Allow camera permission and try again.";
            setCameraReady(false);
            setError(message);
            notify(message, "error");
        }
    };

    const checkMicrophone = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach((track) => track.stop());
            setMicReady(true);
            notify("Microphone is ready.", "success");
        } catch {
            setMicReady(false);
            notify("Microphone access is unavailable. You can still type your answers.", "warning");
        }
    };

    const recordIntegrityEvent = useCallback((type, metadata = {}) => {
        if (!attempt?._id || !attemptToken || !assessment?.integrity?.enabled) return;
        api.post(`/assessments/public/${shareToken}/attempts/${attempt._id}/integrity-events`, { type, metadata }, { headers: candidateToolHeaders, skipAuthRedirect: true }).catch(() => {});
    }, [assessment?.integrity?.enabled, attempt?._id, attemptToken, candidateToolHeaders, shareToken]);

    useEffect(() => {
        if (!attempt || !attemptToken || !assessment?.integrity?.enabled) return undefined;
        const visibility = () => { if (document.hidden && assessment.integrity.trackFocus) recordIntegrityEvent("tab_hidden"); };
        const blur = () => assessment.integrity.trackFocus && recordIntegrityEvent("window_blur");
        const fullscreen = () => { const active = Boolean(document.fullscreenElement); setFullscreenActive(active); if (assessment.integrity.requireFullscreen && !active) recordIntegrityEvent("fullscreen_exit"); };
        const copy = () => assessment.integrity.trackClipboard && recordIntegrityEvent("copy");
        const paste = () => assessment.integrity.trackClipboard && recordIntegrityEvent("paste");
        const offline = () => recordIntegrityEvent("offline");
        const onlineEvent = () => recordIntegrityEvent("online");
        document.addEventListener("visibilitychange", visibility);
        document.addEventListener("fullscreenchange", fullscreen);
        document.addEventListener("copy", copy);
        document.addEventListener("paste", paste);
        window.addEventListener("blur", blur);
        window.addEventListener("offline", offline);
        window.addEventListener("online", onlineEvent);
        return () => {
            document.removeEventListener("visibilitychange", visibility);
            document.removeEventListener("fullscreenchange", fullscreen);
            document.removeEventListener("copy", copy);
            document.removeEventListener("paste", paste);
            window.removeEventListener("blur", blur);
            window.removeEventListener("offline", offline);
            window.removeEventListener("online", onlineEvent);
        };
    }, [assessment?.integrity, attempt, attemptToken, recordIntegrityEvent]);

    useEffect(() => {
        const warn = (event) => {
            if (!Object.keys(dirty).length) return;
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty]);

    const answerKey = (roundIndex, questionIndex, followUp = false) => `${roundIndex}:${questionIndex}:${followUp ? "followup" : "answer"}`;
    const updateLocal = useCallback((roundIndex, questionIndex, key, value) => {
        setDirty((current) => ({ ...current, [answerKey(roundIndex, questionIndex, key === "followUpAnswer")]: true }));
        setAttempt((current) => current ? ({
            ...current,
            rounds: current.rounds.map((round, ri) => ri === roundIndex ? {
                ...round,
                questions: round.questions.map((question, qi) => qi === questionIndex ? { ...question, [key]: value } : question),
            } : round),
        }) : current);
    }, []);

    const saveAnswer = async (roundIndex, questionIndex, followUp = false, spokenExplanation = "") => {
        const round = attempt.rounds[roundIndex];
        const question = round.questions[questionIndex];
        const value = followUp ? question.followUpAnswer : question.answer;
        if (!value?.trim()) { notify("Add your response before continuing.", "warning"); return null; }
        if (round.deliveryMode === "conversational") await pauseHandsFree();
        setBusy(true);
        try {
            const body = followUp
                ? { roundIndex, questionIndex, followUpAnswer: value }
                : { roundIndex, questionIndex, answer: value, spokenExplanation: spokenExplanation || "", diagramData: question.diagramData || "" };
            const { data } = await api.put(`${candidateToolBase}/answer`, body, { headers: candidateToolHeaders, skipAuthRedirect: true });
            const key = answerKey(roundIndex, questionIndex, followUp);
            const nextDirty = { ...dirty };
            delete nextDirty[key];
            setDirty(nextDirty);
            persist(data.attempt, attemptToken, nextDirty);
            return data.attempt;
        } catch (err) {
            notify(describeError(err, "Your response could not be saved."), "error");
            if (round.deliveryMode === "conversational") await resumeHandsFree(focusedVoiceTargetRef.current);
            return null;
        } finally { setBusy(false); }
    };

    const activeRound = attempt?.rounds?.[activeRoundIndex];
    const activeQuestion = activeRound?.questions?.[activeQuestionIndex];
    const activePendingFollowUp = pendingFollowUpFor(activeRound, activeQuestion);
    const isActiveConversation = activeRound?.deliveryMode === "conversational";
    const isActiveSystemDesign = activeRound?.deliveryMode === "system-design";
    const isActiveDebugging = activeRound?.deliveryMode === "debugging";
    const isActiveOA = activeRound?.deliveryMode === "online-assessment";
    const answerTarget = `candidate:${activeRoundIndex}:${activeQuestionIndex}`;
    const focusedAnswerField = activePendingFollowUp ? "followup" : focusedField;
    const voiceTarget = isActiveSystemDesign ? `${answerTarget}:answer` : `${answerTarget}:${focusedAnswerField}`;

    useEffect(() => { focusedVoiceTargetRef.current = voiceTarget; retargetListening(voiceTarget); }, [retargetListening, voiceTarget]);
    useEffect(() => { diagramSceneRef.current = activeQuestion?.diagramData || ""; }, [activeQuestion?._id, activeQuestion?.diagramData]);
    useEffect(() => {
        setCodingEnabled(isActiveOA || (!isActiveSystemDesign && !isActiveDebugging && /\b(code|implement|algorithm|data structure|complexity|function|program)\b/i.test(activeQuestion?.text || "")));
    }, [activeQuestion?._id, activeQuestion?.text, isActiveDebugging, isActiveOA, isActiveSystemDesign]);
    useEffect(() => { setFocusedField(activePendingFollowUp ? "followup" : "answer"); }, [activePendingFollowUp, activeQuestion?._id]);

    // Brings the Coding round's voice experience up to parity with Practice's OAForm: the
    // interviewer narrates each problem and the mic listens hands-free, instead of a bare
    // push-to-talk button with no narration. Mirrors OAForm's structure exactly, including
    // keeping the resume call in a separate effect (driven by oaSpeaking/handsFreePaused
    // state) rather than at the end of this same effect — that was the actual OAForm bug
    // fixed earlier: if the resume call sat at the end of this async chain, any re-render
    // mid-utterance would cancel the effect before that final call ever ran, leaving the mic
    // paused forever. Keeping the same shape here is cheap insurance against that recurring,
    // even though useVoiceInput's callbacks are referentially stable now.
    useEffect(() => {
        oaSpokenQuestionKeysRef.current = new Set();
        oaRoundIntroducedRef.current = false;
    }, [activeRound?._id]);
    useEffect(() => {
        if (!isActiveOA || !activeQuestion?.text) return undefined;
        const key = activeQuestion._id || `${activeRoundIndex}:${activeQuestionIndex}`;
        if (oaSpokenQuestionKeysRef.current.has(key)) return undefined;
        let cancelled = false;
        (async () => {
            if (supportsSTT) await startHandsFree?.(voiceTarget);
            if (cancelled) return;
            if (supportsTTS) {
                setOaSpeaking(true);
                await pauseHandsFree?.();
                const isRoundIntroduction = !oaRoundIntroducedRef.current;
                await new Promise((resolve) => setTimeout(resolve, isRoundIntroduction ? 900 : 450));
                if (cancelled) return;
                const prompt = isRoundIntroduction
                    ? `Hi, welcome to the ${activeRound?.name || "coding"} round. Take a moment to understand the problem. Here's your first question: ${activeQuestion.text}`
                    : `Let's move to the next problem: ${activeQuestion.text}`;
                oaSpokenQuestionKeysRef.current.add(key);
                oaRoundIntroducedRef.current = true;
                await speakNow?.(prompt);
                setOaSpeaking(false);
            } else {
                oaSpokenQuestionKeysRef.current.add(key);
                oaRoundIntroducedRef.current = true;
            }
        })();
        return () => { cancelled = true; };
    }, [isActiveOA, activeQuestion?._id, activeQuestion?.text, activeRoundIndex, activeQuestionIndex, activeRound?.name, pauseHandsFree, speakNow, startHandsFree, supportsSTT, supportsTTS, voiceTarget]);
    useEffect(() => {
        if (!isActiveOA || !supportsSTT || !micSessionActive || !handsFreePaused || oaSpeaking || busy) return undefined;
        let cancelled = false;
        (async () => { await resumeHandsFree?.(voiceTarget); if (cancelled) return; })();
        return () => { cancelled = true; };
    }, [isActiveOA, supportsSTT, micSessionActive, handsFreePaused, oaSpeaking, busy, resumeHandsFree, voiceTarget]);

    const finishRoundSoftly = useCallback((nextAttempt, roundIndex) => {
        const currentRound = nextAttempt?.rounds?.[roundIndex];
        const nextRound = nextAttempt?.rounds?.[roundIndex + 1];
        if (!currentRound) return;
        stopHandsFree();
        setRoundTransition({
            roundIndex,
            nextRoundIndex: nextRound ? roundIndex + 1 : null,
            title: `Thanks — that wraps up ${currentRound.name}.`,
            message: nextRound
                ? `That gives me what I need for this part. When you’re ready, we’ll move on to ${nextRound.name}.`
                : "That gives me what I need from the interview. Review the completion summary, then submit when you’re ready.",
        });
    }, [stopHandsFree]);

    const goToNextQuestion = useCallback((nextAttempt = attempt) => {
        if (!nextAttempt) return;
        const round = nextAttempt.rounds?.[activeRoundIndex];
        if (activeQuestionIndex + 1 < (round?.questions?.length || 0)) {
            setActiveQuestionIndex(activeQuestionIndex + 1);
            setRoundTransition(null);
            return;
        }
        if (round?.deliveryMode === "online-assessment") {
            const incompleteIndex = firstIncompleteQuestionIndex(round);
            if (incompleteIndex >= 0) {
                const completed = completedQuestionCount(round);
                setActiveQuestionIndex(incompleteIndex);
                setRoundTransition(null);
                notify(`Problem ${incompleteIndex + 1} still needs a saved response. ${completed} of ${round.questions.length} problems are complete.`, "warning");
                return;
            }
        }
        finishRoundSoftly(nextAttempt, activeRoundIndex);
    }, [activeQuestionIndex, activeRoundIndex, attempt, finishRoundSoftly, notify]);

    const continueAfterRound = () => {
        if (roundTransition?.nextRoundIndex != null) {
            setActiveRoundIndex(roundTransition.nextRoundIndex);
            setActiveQuestionIndex(0);
            setRoundTransition(null);
            return;
        }
        setRoundTransition(null);
        setSubmitConfirmOpen(true);
        window.setTimeout(() => document.getElementById("assessment-submit")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    };

    const updateDiagram = (value) => {
        if (value === diagramSceneRef.current) return;
        diagramSceneRef.current = value;
        updateLocal(activeRoundIndex, activeQuestionIndex, "diagramData", value);
    };

    const completeSystemDesign = async () => {
        if (!activeQuestion?.answer?.trim()) { notify("Explain your design before ending the discussion.", "warning"); return false; }
        setBusy(true);
        try {
            const { data } = await api.put(`${candidateToolBase}/system-design/complete`, {
                roundIndex: activeRoundIndex,
                questionIndex: activeQuestionIndex,
                transcript: activeQuestion.answer,
                diagramData: activeQuestion.diagramData || "",
            }, { headers: candidateToolHeaders, skipAuthRedirect: true });
            persist(data.attempt);
            finishRoundSoftly(data.attempt, activeRoundIndex);
            return true;
        } catch (err) {
            notify(describeError(err, "Your system-design discussion could not be saved."), "error");
            return false;
        } finally { setBusy(false); }
    };

    const saveConversationTurn = async () => {
        const nextAttempt = await saveAnswer(activeRoundIndex, activeQuestionIndex, false, spokenNotes[answerTarget] ?? activeQuestion?.spokenExplanation ?? "");
        if (!nextAttempt) return;
        const nextRound = nextAttempt.rounds?.[activeRoundIndex];
        const nextQuestion = nextRound?.questions?.[activeQuestionIndex];
        if (!pendingFollowUpFor(nextRound, nextQuestion)) goToNextQuestion(nextAttempt);
    };

    const saveConversationFollowUp = async () => {
        const nextAttempt = await saveAnswer(activeRoundIndex, activeQuestionIndex, true);
        if (!nextAttempt) return;
        const nextRound = nextAttempt.rounds?.[activeRoundIndex];
        const nextQuestion = nextRound?.questions?.[activeQuestionIndex];
        if (!pendingFollowUpFor(nextRound, nextQuestion)) goToNextQuestion(nextAttempt);
    };

    const submit = async () => {
        stopHandsFree();
        setSubmitConfirmOpen(false);
        setBusy(true);
        try {
            await api.post(`${candidateToolBase}/submit`, {}, { headers: candidateToolHeaders, skipAuthRedirect: true });
            removeSavedAttempt(storageKey);
            setRestoreNotice("");
            setSubmitted(true);
            notify("Assessment submitted successfully.", "success");
        } catch (err) {
            notify(describeError(err, "Your assessment could not be submitted."), "error");
        } finally { setBusy(false); }
    };

    const allRoundsComplete = Boolean(attempt?.rounds?.length) && attempt.rounds.every(roundComplete);
    const durationSeconds = Math.max(60, Number(assessment?.durationMinutes || 30) * 60);
    const elapsedSeconds = attempt?.startedAt ? Math.max(0, (clockNow - new Date(attempt.startedAt).getTime()) / 1000) : 0;
    const remainingSeconds = Math.max(0, durationSeconds - elapsedSeconds);
    const timerUrgent = remainingSeconds <= 300;
    const timeReached = Boolean(attempt?.startedAt) && remainingSeconds <= 0;
    const runtimeCameraReady = !assessment?.integrity?.requireCamera || (cameraReady && faceStatus !== "camera_interrupted");
    const integrityRecovery = attempt ? integrityRecoveryReason({ integrity: assessment?.integrity, cameraReady: runtimeCameraReady, fullscreenActive }) : "";

    if (loading) return <Stack minHeight="70vh" justifyContent="center" alignItems="center"><CircularProgress /></Stack>;
    if (!assessment) return <Container maxWidth="sm" sx={{ py: 8 }}><Alert severity="error">{error}</Alert></Container>;
    if (submitted) return <Container maxWidth="sm" sx={{ py: 8 }}><Paper variant="outlined" sx={{ p: 5, textAlign: "center" }}><Typography component="h1" variant="h4" fontWeight={850}>Assessment submitted</Typography><Typography color="text.secondary" mt={2}>Your responses were sent to the recruiting team. You can safely close this page.</Typography></Paper></Container>;

    const plannedUnits = assessment.rounds.reduce((sum, round) => sum + (["system-design", "debugging"].includes(round.deliveryMode) ? 1 : round.questionCount), 0);

    return (
        <>
        <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}>
            {!attempt ? (
                <>
                    <Typography variant="overline" color="primary" fontWeight={800}>{assessment.organizationName || "Candidate assessment"}</Typography>
                    <Typography component="h1" variant="h3" sx={{ fontSize: { xs: "2.35rem", sm: "3rem" } }} fontWeight={850}>{assessment.title}</Typography>
                    <Typography color="text.secondary" mt={1}>{assessment.jobRole} · up to {plannedUnits} {plannedUnits === 1 ? "question" : "questions"} · about {assessment.durationMinutes || 30} minutes</Typography>
                    {assessment.expiresAt && <Typography variant="body2" color="text.secondary" mt={1}>Submit by {formatAssessmentDateTime(assessment.expiresAt, assessment.timezone || "UTC")}</Typography>}
                    {assessment.candidateInstructions && <Alert severity="info" sx={{ mt: 3 }}>{assessment.candidateInstructions}</Alert>}
                    {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

                    <Paper component="form" onSubmit={start} variant="outlined" sx={{ p: { xs: 2, md: 4 }, mt: 3, maxWidth: 900 }}>
                        <Typography component="h2" variant="h5" fontWeight={800}>Before you begin</Typography>
                        <Typography color="text.secondary" mt={1} mb={3}>Check your device once, confirm your identity, and start. There is no interviewer configuration step.</Typography>
                        <Stack spacing={2}>
                            <Paper variant="outlined" sx={{ p: 2 }}>
                                <Typography fontWeight={800}>Device readiness</Typography>
                                <Typography variant="body2" color="text.secondary" mb={1.5}>Voice is optional unless the interview instructions say otherwise. You can always type.</Typography>
                                <Stack direction={{ xs: "column", sm: "row" }} gap={1} flexWrap="wrap">
                                    <Chip icon={online ? <CheckCircleOutlineRounded /> : <ErrorOutlineRounded />} color={online ? "success" : "error"} variant="outlined" label={online ? "Internet connected" : "Offline"} />
                                    <Chip icon={supportsSTT ? <CheckCircleOutlineRounded /> : <ErrorOutlineRounded />} color={supportsSTT ? "success" : "default"} variant="outlined" label={supportsSTT ? "Voice input supported" : "Typing available"} />
                                    {micReady ? <Chip icon={<CheckCircleOutlineRounded />} color="success" variant="outlined" label="Microphone ready" /> : <Button type="button" size="small" variant="outlined" onClick={checkMicrophone}>Check microphone</Button>}
                                    {assessment.integrity?.requireCamera && (cameraReady ? <Chip icon={<CheckCircleOutlineRounded />} color="success" variant="outlined" label="Camera ready" /> : <Button type="button" size="small" variant="outlined" onClick={checkCamera}>Check camera</Button>)}
                                </Stack>
                            </Paper>
                            <TextField required label="Full name" value={identity.name} onChange={(event) => setIdentity({ ...identity, name: event.target.value })} />
                            <TextField required type="email" label="Email address" value={identity.email} disabled={emailLocked} helperText={emailLocked ? "Prefilled from your invitation" : ""} onChange={(event) => setIdentity({ ...identity, email: event.target.value })} />
                            <FormControlLabel control={<Checkbox required checked={consent} onChange={(event) => setConsent(event.target.checked)} />} label={<span>I understand how my assessment data is processed and shared. <Link component={RouterLink} to="/privacy" target="_blank">Privacy notice</Link></span>} />
                            {assessment.integrity?.enabled && <Alert severity="warning"><Typography fontWeight={750}>Integrity signals are enabled</Typography><Typography variant="body2">The recruiting team may review tab visibility, window focus, fullscreen, clipboard, connectivity{assessment.integrity.monitorFacePresence ? ", and sustained face-presence" : ""} events. Camera frames stay in your browser and are not saved or uploaded. These signals are context—not automatic cheating findings—and are retained for {assessment.integrity.retentionDays || 30} days.</Typography><FormControlLabel control={<Checkbox required checked={integrityConsent} onChange={(event) => setIntegrityConsent(event.target.checked)} />} label="I consent to these integrity signals" /></Alert>}
                            {assessment.contactEmail && <Typography variant="body2" color="text.secondary">Need an accommodation or technical help? Contact <Link href={`mailto:${assessment.contactEmail}`}>{assessment.contactEmail}</Link>.</Typography>}
                            <Box><Button type="submit" variant="contained" disabled={busy || !online || !consent || (assessment.integrity?.enabled && !integrityConsent) || (assessment.integrity?.requireCamera && !cameraReady)}>{busy ? <CircularProgress size={22} color="inherit" /> : "Start assessment"}</Button></Box>
                        </Stack>
                    </Paper>
                </>
            ) : (
                <>
                    <Paper variant="outlined" sx={{ position: "sticky", top: 8, zIndex: 30, mb: 2, px: { xs: 1.5, md: 2.5 }, py: 1.5, borderRadius: 3, bgcolor: "background.paper" }}>
                        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={1.5} alignItems={{ md: "center" }}>
                            <Box>
                                <Typography variant="overline" color="primary.main" fontWeight={850}>{assessment.organizationName || "Live interview"}</Typography>
                                <Typography fontWeight={850}>{assessment.title}</Typography>
                                <Typography variant="caption" color="text.secondary">{activeRound?.name}</Typography>
                            </Box>
                            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                <Chip size="small" color={online ? "success" : "error"} variant="outlined" label={online ? "Connected" : "Offline · local recovery active"} />
                                <Chip size="small" color={timerUrgent ? "warning" : "default"} label={timeReached ? "Target time reached" : `Target finish · ${formatTime(remainingSeconds)} remaining`} />
                            </Stack>
                        </Stack>
                    </Paper>

                    {restoreNotice && <Alert severity="info" sx={{ mb: 2 }} action={<Stack direction="row" spacing={1}><Button color="inherit" size="small" onClick={() => setRestoreNotice("")}>Continue</Button><Button color="inherit" size="small" onClick={() => { removeSavedAttempt(storageKey); setAttempt(null); setAttemptToken(""); setDirty({}); setRestoreNotice(""); }}>Start over</Button></Stack>}>{restoreNotice}</Alert>}
                    {timeReached && <Alert severity="warning" sx={{ mb: 2 }}>The suggested interview time has been reached. Finish the current response and submit when ready; your attempt is not automatically ended.</Alert>}
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                    <Box sx={{ minWidth: 0 }}>
                        {integrityRecovery ? (
                            <Paper variant="outlined" sx={{ p: { xs: 3, md: 5 }, minHeight: 320, display: "grid", alignContent: "center", borderRadius: 3 }}>
                                <Stack spacing={2} alignItems="flex-start">
                                    <Typography component="h2" variant="h5" fontWeight={850}>Restore required assessment conditions</Typography>
                                    <Alert severity="warning">{integrityRecovery === "fullscreen" ? "Fullscreen is required to continue this assessment." : "Camera access is required to continue this assessment."}</Alert>
                                    {integrityRecovery === "fullscreen" ? <Button variant="contained" onClick={enterFullscreen}>Enter fullscreen</Button> : <Button variant="contained" onClick={checkCamera}>Restore camera</Button>}
                                </Stack>
                            </Paper>
                        ) : roundTransition ? (
                            <Paper variant="outlined" sx={{ p: { xs: 3, md: 5 }, minHeight: 340, display: "grid", alignContent: "center", borderRadius: 3 }}>
                                <Stack spacing={2} alignItems="flex-start">
                                    <Typography variant="overline" color="primary.main" fontWeight={800}>Interviewer</Typography>
                                    <Typography component="h2" variant="h4" fontWeight={850}>{roundTransition.title}</Typography>
                                    <Typography color="text.secondary" sx={{ maxWidth: 680 }}>{roundTransition.message}</Typography>
                                    <Button variant="contained" onClick={continueAfterRound}>{roundTransition.nextRoundIndex != null ? `Continue to ${attempt.rounds[roundTransition.nextRoundIndex]?.name || "next round"}` : "Review and submit"}</Button>
                                </Stack>
                            </Paper>
                        ) : isActiveSystemDesign && activeQuestion ? (
                            <SystemDesignDiscussionPanel
                                problem={activeQuestion.text}
                                transcript={activeQuestion.answer || ""}
                                onTranscriptChange={(value) => updateLocal(activeRoundIndex, activeQuestionIndex, "answer", value)}
                                diagramData={activeQuestion.diagramData || ""}
                                onDiagramChange={updateDiagram}
                                discussionTurns={activeQuestion.discussionTurns || []}
                                target={voiceTarget}
                                checkpointEndpoint={`${candidateToolBase}/system-design/checkpoint`}
                                checkpointHeaders={candidateToolHeaders}
                                skipAuthRedirect
                                supportsSTT={supportsSTT}
                                supportsTTS={supportsTTS}
                                listening={listening}
                                listeningTarget={listeningTarget}
                                interimText={interimText}
                                micLevel={micLevel}
                                isSpeaking={isSpeaking}
                                micPermission={micPermission}
                                micSessionActive={micSessionActive}
                                handsFreePaused={handsFreePaused}
                                startHandsFree={startHandsFree}
                                pauseHandsFree={pauseHandsFree}
                                resumeHandsFree={resumeHandsFree}
                                stopHandsFree={stopHandsFree}
                                speakNow={speakNow}
                                onEnd={completeSystemDesign}
                                ending={busy}
                                cameraOn={roundCameraOn}
                                requireCamera={Boolean(assessment.integrity?.requireCamera)}
                                cameraSlot={<WebcamPreview autoStart={assessment.integrity?.requireCamera} required={assessment.integrity?.requireCamera} monitorFaces={assessment.integrity?.enabled && assessment.integrity?.monitorFacePresence} onIntegrityEvent={recordIntegrityEvent} onFaceStatusChange={setFaceStatus} onCameraStatusChange={(status) => setRoundCameraOn(status.on)} />}
                            />
                        ) : isActiveConversation && activeQuestion ? (
                            <ConversationalPanel
                                convSubmitting={busy}
                                convRoundSubmitting={false}
                                convState={{ index: activeQuestionIndex, current: { text: activeQuestion.text }, done: false }}
                                convAnswer={activePendingFollowUp ? activeQuestion.followUpAnswer || "" : activeQuestion.answer || ""}
                                setConvAnswer={(value) => updateLocal(activeRoundIndex, activeQuestionIndex, activePendingFollowUp ? "followUpAnswer" : "answer", value)}
                                spokenAnswer={spokenNotes[answerTarget] ?? activeQuestion.spokenExplanation ?? ""}
                                setSpokenAnswer={(value) => { setSpokenNotes((current) => ({ ...current, [answerTarget]: value })); setDirty((current) => ({ ...current, [answerKey(activeRoundIndex, activeQuestionIndex)]: true })); }}
                                codingEnabled={codingEnabled}
                                onCodingModeChange={setCodingEnabled}
                                codeDraftKey={`candidate:${attempt._id}:${activeRound._id}:${activeQuestion._id}`}
                                codeEditorProps={{ executionEndpoint: `${candidateToolBase}/run-code`, executionHeaders: candidateToolHeaders, skipAuthRedirect: true, canRun: assessment.capabilities?.codeExecution !== false }}
                                onSubmitAnswer={saveConversationTurn}
                                pendingFollowUp={activePendingFollowUp}
                                onFollowUpDone={saveConversationFollowUp}
                                supportsTTS={supportsTTS}
                                supportsSTT={supportsSTT}
                                listening={listening}
                                listeningTarget={listeningTarget}
                                interimText={interimText}
                                micLevel={micLevel}
                                isSpeaking={isSpeaking}
                                onSpeak={speakNow}
                                savedAt={lastSavedAt}
                                micSessionActive={micSessionActive}
                                handsFreePaused={handsFreePaused}
                                onStartHandsFree={startHandsFree}
                                onPauseHandsFree={pauseHandsFree}
                                onResumeHandsFree={resumeHandsFree}
                                onStopHandsFree={stopHandsFree}
                                target={voiceTarget}
                                showRoundControls={false}
                                allowFollowUpSkip={false}
                                showFollowUpCount={false}
                                submitAnswerLabel="I’m done"
                                submitFollowUpLabel="I’m done"
                                cameraSlot={<WebcamPreview autoStart={assessment.integrity?.requireCamera} required={assessment.integrity?.requireCamera} monitorFaces={assessment.integrity?.enabled && assessment.integrity?.monitorFacePresence} onIntegrityEvent={recordIntegrityEvent} onFaceStatusChange={setFaceStatus} />}
                            />
                        ) : isActiveDebugging ? (
                            <CandidateDebuggingRound
                                endpoint={`${candidateToolBase}/debugging/${activeRoundIndex}`}
                                headers={candidateToolHeaders}
                                canRun={assessment.capabilities?.codeExecution !== false}
                                onSubmitted={(nextAttempt) => {
                                    persist(nextAttempt);
                                    finishRoundSoftly(nextAttempt, activeRoundIndex);
                                }}
                            />
                        ) : isActiveOA && activeQuestion ? (
                            <Paper variant="outlined" sx={{ overflow: "hidden", borderRadius: 3, position: "relative" }}>
                                <Box sx={{ px: 2.5, py: 1.5, bgcolor: "action.hover", borderBottom: "1px solid", borderColor: "divider" }}>
                                    <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1} alignItems={{ sm: "center" }}>
                                        <Box><Typography variant="overline" color="primary.main" fontWeight={850}>Online assessment · Problem {activeQuestionIndex + 1} of {activeRound.questions.length}</Typography><Typography variant="body2" color="text.secondary">Move freely between problems. The round only finishes after every problem has a saved response.</Typography></Box>
                                        <Chip size="small" color={dirty[answerKey(activeRoundIndex, activeQuestionIndex)] ? "warning" : activeQuestion.answer ? "success" : "default"} label={dirty[answerKey(activeRoundIndex, activeQuestionIndex)] ? "Unsaved draft" : activeQuestion.answer ? "Saved" : "Not answered"} />
                                    </Stack>
                                </Box>
                                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(300px,.7fr) minmax(0,1.3fr)" }, minHeight: { lg: 580 } }}>
                                    <Box sx={{ p: 2.5, borderRight: { lg: "1px solid" }, borderBottom: { xs: "1px solid", lg: 0 }, borderColor: "divider" }}>
                                        <Typography variant="caption" color="text.secondary" fontWeight={850}>PROBLEM STATEMENT</Typography>
                                        <Typography component="h2" variant="h5" fontWeight={850} sx={{ lineHeight: 1.45, mt: .5 }}>{activeQuestion.text}</Typography>
                                        <Box sx={{ mt: 2 }}><VoiceControls target={voiceTarget} speakText={activeQuestion.text} supportsTTS={supportsTTS} supportsSTT={supportsSTT} listening={listening} listeningTarget={listeningTarget} onSpeak={speakNow} handsFree micSessionActive={micSessionActive} handsFreePaused={handsFreePaused} onStartHandsFree={startHandsFree} micPermission={micPermission} micLevel={micLevel} inputDevices={inputDevices} selectedDeviceId={selectedDeviceId} onChangeDevice={setSelectedDeviceId} /></Box>
                                        <Typography variant="caption" color="text.secondary" fontWeight={850} display="block" mt={3}>PROBLEM NAVIGATION</Typography>
                                        <Box sx={{ display: "flex", flexWrap: "wrap", gap: .75, mt: 1 }}>
                                            {activeRound.questions.map((question, index) => <Button key={question._id} size="small" variant={index === activeQuestionIndex ? "contained" : "outlined"} color={question.answer ? "success" : "primary"} onClick={() => { stopListening(); setActiveQuestionIndex(index); }}>{index + 1}</Button>)}
                                        </Box>
                                    </Box>
                                    <Box sx={{ p: 2.5, minWidth: 0, bgcolor: "background.default" }}>
                                        <Typography variant="caption" color="text.secondary" fontWeight={850}>WORKSPACE</Typography>
                                        <Box mt={1}><CodeEditorField value={activeQuestion.answer || ""} onChange={(value) => updateLocal(activeRoundIndex, activeQuestionIndex, "answer", value)} onFocus={() => setFocusedField("answer")} minRows={16} draftKey={`candidate:${attempt._id}:${activeRound._id}:${activeQuestion._id}`} suggestCode={/\b(code|coding|implement|algorithm|function|class|program)\b/i.test(activeQuestion.text)} onModeChange={setCodingEnabled} executionEndpoint={`${candidateToolBase}/run-code`} executionHeaders={candidateToolHeaders} skipAuthRedirect canRun={assessment.capabilities?.codeExecution !== false} /></Box>
                                        {codingEnabled && <TextField fullWidth multiline minRows={3} sx={{ mt: 2 }} label="Explain your approach" value={spokenNotes[answerTarget] ?? activeQuestion.spokenExplanation ?? ""} onChange={(event) => { setSpokenNotes((current) => ({ ...current, [answerTarget]: event.target.value })); setDirty((current) => ({ ...current, [answerKey(activeRoundIndex, activeQuestionIndex)]: true })); }} />}
                                        {activePendingFollowUp && <Paper variant="outlined" sx={{ p: 2, mt: 2, borderColor: "primary.main" }}><Typography variant="caption" color="primary.main" fontWeight={850}>INTERVIEWER FOLLOW-UP</Typography><Typography fontWeight={750}>{activePendingFollowUp.question}</Typography><TextField fullWidth multiline minRows={3} sx={{ mt: 1 }} label="Your follow-up answer" value={activeQuestion.followUpAnswer || ""} onChange={(event) => updateLocal(activeRoundIndex, activeQuestionIndex, "followUpAnswer", event.target.value)} /><Button sx={{ mt: 1 }} variant="contained" disabled={busy || !activeQuestion.followUpAnswer?.trim()} onClick={async () => { const nextAttempt = await saveAnswer(activeRoundIndex, activeQuestionIndex, true); if (nextAttempt && !pendingFollowUpFor(nextAttempt.rounds[activeRoundIndex], nextAttempt.rounds[activeRoundIndex].questions[activeQuestionIndex])) goToNextQuestion(nextAttempt); }}>Save follow-up</Button></Paper>}
                                        {/* Scoped to its own sized slot (matching Practice's OAForm) rather than
                                            floating relative to the whole round Paper, which let the tile drift
                                            over the footer's Save/Save-and-continue button and block clicks. */}
                                        <Box data-testid="online-assessment-camera-slot" sx={{ position: "relative", height: { xs: 104, sm: 131 }, mt: 2 }}>
                                            <WebcamPreview autoStart={assessment.integrity?.requireCamera} required={assessment.integrity?.requireCamera} monitorFaces={assessment.integrity?.enabled && assessment.integrity?.monitorFacePresence} onIntegrityEvent={recordIntegrityEvent} onFaceStatusChange={setFaceStatus} />
                                        </Box>
                                    </Box>
                                </Box>
                                <Box sx={{ px: 2.5, py: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
                                    <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1}>
                                        <Stack direction="row" spacing={1}><Button disabled={activeQuestionIndex === 0 || busy} onClick={() => setActiveQuestionIndex((index) => Math.max(0, index - 1))}>Previous</Button>{activeQuestionIndex < activeRound.questions.length - 1 && <Button variant="outlined" disabled={busy} onClick={() => setActiveQuestionIndex((index) => Math.min(activeRound.questions.length - 1, index + 1))}>Next problem</Button>}</Stack>
                                        <Button variant="contained" disabled={busy || !activeQuestion.answer?.trim() || Boolean(activePendingFollowUp)} onClick={async () => { const nextAttempt = await saveAnswer(activeRoundIndex, activeQuestionIndex, false, spokenNotes[answerTarget] ?? activeQuestion.spokenExplanation); if (!nextAttempt) return; const nextRound = nextAttempt.rounds[activeRoundIndex]; const nextQuestion = nextRound.questions[activeQuestionIndex]; if (!pendingFollowUpFor(nextRound, nextQuestion)) goToNextQuestion(nextAttempt); }}>{busy ? "Saving…" : activeQuestionIndex === activeRound.questions.length - 1 ? "Save and review round" : "Save and continue"}</Button>
                                    </Stack>
                                </Box>
                            </Paper>
                        ) : (
                            <Paper variant="outlined" sx={{ p: 4 }}><Typography color="text.secondary">Preparing the next interview step…</Typography></Paper>
                        )}

                        {assessment.integrity?.monitorFacePresence && ["missing", "multiple", "camera_interrupted", "unavailable"].includes(faceStatus) && <Alert severity={faceStatus === "unavailable" ? "info" : "warning"} sx={{ mt: 1 }}>{faceStatus === "missing" ? "We can’t clearly see your face. Please return to the camera view." : faceStatus === "multiple" ? "More than one face is visible. Please ensure only you are in frame." : faceStatus === "camera_interrupted" ? "Your camera stopped. Restore camera access to continue the monitored interview." : "Face detection is unavailable in this browser. This is recorded as a technical event, not an automatic misconduct finding."}</Alert>}

                        {allRoundsComplete && !roundTransition && (
                            <Paper id="assessment-submit" variant="outlined" sx={{ mt: 2, p: { xs: 2.5, md: 3 }, borderRadius: 3 }}>
                                <Typography component="h2" variant="h5" fontWeight={850}>Interview complete</Typography>
                                <Typography color="text.secondary" mt={.5}>All {attempt.rounds.length} rounds are complete and your responses are saved. Detailed evaluation is generated only after submission.</Typography>
                                <Button variant="contained" sx={{ mt: 2 }} disabled={busy} onClick={() => setSubmitConfirmOpen(true)}>Review and submit</Button>
                            </Paper>
                        )}
                    </Box>
                </>
            )}
        </Container>

        <Dialog open={submitConfirmOpen} onClose={() => !busy && setSubmitConfirmOpen(false)} aria-labelledby="candidate-submit-title" maxWidth="sm" fullWidth>
            <DialogTitle id="candidate-submit-title">Ready to submit?</DialogTitle>
            <DialogContent>
                <Stack spacing={1.5}>
                    <Typography>{attempt?.rounds?.length || 0} of {attempt?.rounds?.length || 0} rounds completed.</Typography>
                    <Alert severity="info">Your responses are saved. After submission, you won’t be able to change them.</Alert>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button disabled={busy} onClick={() => setSubmitConfirmOpen(false)}>Keep reviewing</Button>
                <Button variant="contained" disabled={busy} onClick={submit}>{busy ? "Submitting…" : "Submit assessment"}</Button>
            </DialogActions>
        </Dialog>
        </>
    );
}
