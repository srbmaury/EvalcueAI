import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert, Box, Button, Chip, CircularProgress, Paper, Skeleton, Stack, TextField, Typography,
} from "@mui/material";
import GraphicEqRoundedIcon from "@mui/icons-material/GraphicEqRounded";
import StopCircleRoundedIcon from "@mui/icons-material/StopCircleRounded";
import { useSystemDesignDiscussion } from "../hooks/useSystemDesignDiscussion";
import { countDiscussionWords, MIN_END_DISCUSSION_WORDS } from "../utils/systemDesignDiscussion";
import WebcamPreview from "./WebcamPreview";

const SystemDesignCanvas = lazy(() => import("./SystemDesignCanvas"));

const clean = (value = "") => value.toString().replace(/\s+/g, " ").trim();

const deltaAfter = (fullText, previousText) => {
    const full = clean(fullText);
    const previous = clean(previousText);
    if (!full || full === previous) return "";
    if (!previous) return full;
    if (full.startsWith(previous)) return full.slice(previous.length).trim();
    return full;
};

export default function SystemDesignDiscussionPanel({
    problem,
    transcript,
    onTranscriptChange,
    diagramData,
    onDiagramChange,
    discussionTurns = [],
    target,
    checkpointEndpoint,
    checkpointHeaders,
    checkpointBody = null,
    skipAuthRedirect = false,
    supportsSTT,
    supportsTTS,
    listening,
    listeningTarget,
    interimText,
    micLevel = 0,
    isSpeaking,
    micPermission = "unknown",
    micSessionActive,
    handsFreePaused,
    startHandsFree,
    pauseHandsFree,
    resumeHandsFree,
    stopHandsFree,
    speakNow,
    onEnd,
    ending = false,
    cameraSlot,
    cameraOn,
    requireCamera,
}) {
    const [aiSpeaking, setAiSpeaking] = useState(false);
    const [defaultCameraState, setDefaultCameraState] = useState({ on: false, denied: false });
    const spokenProblemRef = useRef("");
    const spokenReadinessRef = useRef("");
    const mountedRef = useRef(true);
    const chatEndRef = useRef(null);
    const isListening = listening && listeningTarget === target;
    // Typed fallback: each sent message is appended to the running transcript (which the
    // interviewer and evaluation read as a whole) instead of replacing it.
    const [typedReply, setTypedReply] = useState("");
    const [typedSendPending, setTypedSendPending] = useState(false);
    const sendTypedReply = () => {
        const text = typedReply.trim();
        if (!text) return;
        const previous = (transcript || "").trim();
        onTranscriptChange?.(previous ? `${previous}\n${text}` : text);
        setTypedReply("");
        setTypedSendPending(true);
    };
    const discussionWords = countDiscussionWords(transcript || "");
    const canEndDiscussion = discussionWords >= MIN_END_DISCUSSION_WORDS;
    const usingDefaultCameraSlot = cameraSlot === undefined;
    const resolvedCameraSlot = usingDefaultCameraSlot
        ? <WebcamPreview autoStart required onCameraStatusChange={setDefaultCameraState} />
        : cameraSlot;
    // Callers that supply their own cameraSlot (e.g. Hiring, driven by org integrity
    // settings) pass cameraOn/requireCamera explicitly; the built-in slot (Practice)
    // tracks its own camera state and requires it by default, matching ConversationalPanel.
    const effectiveRequireCamera = requireCamera ?? usingDefaultCameraSlot;
    const effectiveCameraOn = usingDefaultCameraSlot ? defaultCameraState.on : (cameraOn ?? true);

    const micReady = !supportsSTT || micSessionActive;
    const camReady = !effectiveRequireCamera || effectiveCameraOn;
    const needsMic = Boolean(supportsSTT && problem && !micReady && !ending);
    const needsCamera = Boolean(effectiveRequireCamera && problem && !camReady && !ending);
    const readinessNeeded = needsMic || needsCamera;
    const readinessPrompt = useMemo(() => {
        if (needsMic && needsCamera) return "Hi, I’m your interviewer. Before we start, please turn on your microphone and camera so this feels like a real mock interview.";
        if (needsMic) return "Hi, I’m your interviewer. Please turn on your microphone before we begin.";
        if (needsCamera) return "Hi, I’m your interviewer. Please turn on your camera before we begin.";
        return "";
    }, [needsCamera, needsMic]);

    // Split from the stopHandsFree cleanup below: mountedRef must only flip on a genuine
    // unmount. A single effect keyed on stopHandsFree would also flip it on every re-render
    // where stopHandsFree's identity changes. The explicit `mountedRef.current = true` in the
    // setup phase (not just relying on the initial useRef(true)) matters even with empty deps:
    // React StrictMode's dev-only mount -> cleanup -> remount cycle runs this effect's cleanup
    // once on the very first mount too, and without re-arming it here nothing would ever set
    // mountedRef back to true afterward — speakInterviewer's `if (mountedRef.current)
    // setAiSpeaking(false)` would then silently never fire, leaving the UI stuck on
    // "Interviewer speaking" forever after that first StrictMode cycle.
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);
    useEffect(() => () => { stopHandsFree?.(); }, [stopHandsFree]);

    const speakInterviewer = useCallback(async (text, { resumeAfter = true } = {}) => {
        if (!text) return;
        await pauseHandsFree?.();
        if (supportsTTS) {
            setAiSpeaking(true);
            await speakNow?.(text);
            if (mountedRef.current) setAiSpeaking(false);
        }
        if (resumeAfter && mountedRef.current) await resumeHandsFree?.(target);
    }, [pauseHandsFree, resumeHandsFree, speakNow, supportsTTS, target]);

    const onInterjection = useCallback(async (item) => {
        await speakInterviewer(item.text);
    }, [speakInterviewer]);

    const { interjections, checkpoint } = useSystemDesignDiscussion({
        enabled: Boolean(problem && checkpointEndpoint),
        endpoint: checkpointEndpoint,
        headers: checkpointHeaders,
        body: checkpointBody,
        transcript,
        diagramData,
        interimText,
        micLevel,
        isSpeaking,
        listening: isListening,
        interviewerSpeaking: aiSpeaking,
        onInterjection,
        skipAuthRedirect,
    });

    useEffect(() => {
        // Runs after the hook has seen the appended transcript, so the checkpoint includes the new message.
        if (!typedSendPending) return;
        setTypedSendPending(false);
        void checkpoint({ force: true });
    }, [checkpoint, transcript, typedSendPending]);

    useEffect(() => {
        // Deliberately excludes aiSpeaking: the readiness-prompt effect below speaks
        // while the mic is still connecting and toggles aiSpeaking around that speech.
        // Depending on aiSpeaking here would retry getUserMedia on every nag and
        // re-trigger the nag again — the same feedback loop fixed in ConversationalPanel.
        if (!supportsSTT || !problem || micSessionActive) return;
        let cancelled = false;
        (async () => { await startHandsFree?.(target); if (cancelled) return; })();
        return () => { cancelled = true; };
    }, [micSessionActive, problem, startHandsFree, supportsSTT, target]);

    useEffect(() => {
        if (!supportsTTS || !readinessNeeded || !readinessPrompt) { spokenReadinessRef.current = ""; return; }
        if (spokenReadinessRef.current === readinessPrompt) return;
        const timer = setTimeout(() => {
            spokenReadinessRef.current = readinessPrompt;
            speakInterviewer(readinessPrompt, { resumeAfter: false });
        }, 250);
        return () => clearTimeout(timer);
    }, [readinessNeeded, readinessPrompt, supportsTTS]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!problem || readinessNeeded || spokenProblemRef.current === problem) return;
        let cancelled = false;
        (async () => {
            spokenProblemRef.current = problem;
            if (supportsTTS) await speakInterviewer(problem);
            if (cancelled) return;
            if (!supportsTTS && supportsSTT) await resumeHandsFree?.(target);
        })();
        return () => { cancelled = true; };
    }, [problem, readinessNeeded, resumeHandsFree, speakInterviewer, supportsSTT, supportsTTS, target]);

    useEffect(() => {
        if (!problem || aiSpeaking || ending || readinessNeeded || !supportsSTT || !micSessionActive || !handsFreePaused) return;
        resumeHandsFree?.(target);
    }, [aiSpeaking, ending, handsFreePaused, micSessionActive, problem, readinessNeeded, resumeHandsFree, supportsSTT, target]);

    const persistedTurns = useMemo(() => (Array.isArray(discussionTurns) ? discussionTurns : [])
        .filter((turn) => ["candidate", "interviewer"].includes(turn?.speaker) && clean(turn?.text))
        .map((turn) => ({ ...turn, text: clean(turn.text) })), [discussionTurns]);

    const chatTurns = useMemo(() => {
        const turns = [];
        if (clean(problem)) turns.push({ id: "opening-problem", speaker: "interviewer", text: clean(problem) });
        persistedTurns.forEach((turn, index) => turns.push({ id: `persisted-${index}-${turn.at || ""}`, ...turn }));

        const persistedInterviewerText = new Set(
            persistedTurns.filter((turn) => turn.speaker === "interviewer").map((turn) => clean(turn.text)),
        );
        let candidateCursor = persistedTurns
            .filter((turn) => turn.speaker === "candidate")
            .map((turn) => clean(turn.text))
            .filter(Boolean)
            .join(" ")
            .trim();

        interjections.forEach((item) => {
            const candidateDelta = deltaAfter(item.candidateTranscript || "", candidateCursor);
            if (candidateDelta) {
                turns.push({ id: `${item.id}-candidate`, speaker: "candidate", text: candidateDelta });
                candidateCursor = clean(item.candidateTranscript);
            }
            if (!persistedInterviewerText.has(clean(item.text))) {
                turns.push({ id: item.id, speaker: "interviewer", text: clean(item.text), at: item.at });
            }
        });

        const liveCandidateDelta = deltaAfter(transcript || "", candidateCursor);
        if (liveCandidateDelta) turns.push({ id: "candidate-live", speaker: "candidate", text: liveCandidateDelta, live: true });
        return turns;
    }, [interjections, persistedTurns, problem, transcript]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    }, [chatTurns.length, interimText]);

    const endDiscussion = async () => {
        await pauseHandsFree?.();
        const result = await onEnd?.();
        if (result === false) await resumeHandsFree?.(target);
        else stopHandsFree?.();
    };

    return (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 300px" }, gap: 2, alignItems: "start" }}>
            <Paper variant="outlined" sx={{ p: { xs: 1, md: 1.25 }, borderRadius: 3, minWidth: 0, position: "relative" }}>
                {readinessNeeded ? (
                    <Stack alignItems="center" justifyContent="center" spacing={2} sx={{ minHeight: 660, px: { xs: 2, sm: 6 }, textAlign: "center" }}>
                        <Typography component="h2" variant="h6" fontWeight={800}>{readinessPrompt}</Typography>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap justifyContent="center">
                            <Chip size="small" color={micReady ? "success" : "warning"} label={micReady ? "Mic ready" : "Mic needed"} />
                            {effectiveRequireCamera && <Chip size="small" color={camReady ? "success" : "warning"} label={camReady ? "Camera ready" : "Camera needed"} />}
                        </Stack>
                        {needsMic && supportsSTT && <Button variant="contained" onClick={() => startHandsFree?.(target)}>Turn on mic</Button>}
                        {needsCamera && <Typography variant="body2" color="text.secondary">Use the camera tile in the bottom-right corner to turn your camera on.</Typography>}
                    </Stack>
                ) : (
                    <Suspense fallback={<Skeleton variant="rounded" height={660} />}>
                        <SystemDesignCanvas
                            value={diagramData || ""}
                            onChange={onDiagramChange}
                            label="Architecture whiteboard"
                        />
                    </Suspense>
                )}
                {resolvedCameraSlot}
            </Paper>

            <Paper
                variant="outlined"
                sx={{
                    borderRadius: 3,
                    overflow: "hidden",
                    position: { lg: "sticky" },
                    top: { lg: 92 },
                    minHeight: { lg: 660 },
                    maxHeight: { lg: "calc(100vh - 110px)" },
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                <Box sx={{ px: 1.5, py: 1.25, borderBottom: "1px solid", borderColor: "divider" }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                        <Typography fontWeight={850}>Conversation</Typography>
                        <Box
                            role="status"
                            aria-live="polite"
                            aria-label={aiSpeaking ? "Interviewer speaking" : isListening ? "Listening" : "Microphone idle"}
                            sx={{
                                width: 34,
                                height: 34,
                                borderRadius: "50%",
                                display: "grid",
                                placeItems: "center",
                                bgcolor: isListening ? "success.light" : "action.hover",
                            }}
                        >
                            <GraphicEqRoundedIcon color={isListening ? "success" : aiSpeaking ? "primary" : "disabled"} sx={{ transform: `scale(${1 + Math.min(.2, micLevel * .3)})` }} />
                        </Box>
                    </Stack>
                </Box>

                <Stack spacing={1.25} sx={{ p: 1.5, overflowY: "auto", flex: 1 }}>
                    {chatTurns.map((turn) => {
                        const candidate = turn.speaker === "candidate";
                        return (
                            <Box key={turn.id} sx={{ display: "flex", justifyContent: candidate ? "flex-end" : "flex-start" }}>
                                <Box
                                    sx={{
                                        maxWidth: "92%",
                                        px: 1.4,
                                        py: 1.05,
                                        borderRadius: 2.25,
                                        bgcolor: candidate ? "primary.main" : "action.hover",
                                        color: candidate ? "primary.contrastText" : "text.primary",
                                        borderTopRightRadius: candidate ? .75 : 2.25,
                                        borderTopLeftRadius: candidate ? 2.25 : .75,
                                    }}
                                >
                                    <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{turn.text}</Typography>
                                </Box>
                            </Box>
                        );
                    })}
                    {interimText && isListening && (
                        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                            <Box sx={{ maxWidth: "92%", px: 1.4, py: 1.05, borderRadius: 2.25, bgcolor: "primary.main", color: "primary.contrastText", opacity: .68 }}>
                                <Typography variant="body2" fontStyle="italic">{interimText}</Typography>
                            </Box>
                        </Box>
                    )}
                    <Box ref={chatEndRef} />
                </Stack>

                <Box sx={{ p: 1.25, borderTop: "1px solid", borderColor: "divider" }}>
                    {/* Typing is always available (candidates are told they can always type); voice is optional. */}
                    {(
                        <Stack spacing={1} mb={1}>
                            {micPermission === "denied" && <Alert severity="warning" sx={{ py: 0 }}>Microphone blocked. You can type instead.</Alert>}
                            <TextField
                                fullWidth
                                multiline
                                minRows={micPermission === "denied" ? 3 : 2}
                                value={typedReply}
                                onChange={(event) => setTypedReply(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" && !event.shiftKey) {
                                        event.preventDefault();
                                        sendTypedReply();
                                    }
                                }}
                                placeholder={micPermission === "denied" ? "Type your response…" : "Speak, or type your response…"}
                                helperText="Enter to send · Shift+Enter for a new line"
                            />
                            <Button size="small" variant="outlined" onClick={sendTypedReply} disabled={!typedReply.trim() || ending} sx={{ alignSelf: "flex-end" }}>Send</Button>
                        </Stack>
                    )}
                    <Stack direction="row" gap={1} justifyContent="flex-end" flexWrap="wrap">
                        {!micSessionActive && supportsSTT && micPermission !== "denied" && (
                            <Button size="small" variant="outlined" onClick={() => startHandsFree?.(target)}>Enable microphone</Button>
                        )}
                        <Button
                            size="small"
                            variant="contained"
                            startIcon={ending ? <CircularProgress size={16} color="inherit" /> : <StopCircleRoundedIcon />}
                            disabled={ending || !canEndDiscussion}
                            onClick={endDiscussion}
                        >
                            {ending ? "Ending…" : "End discussion"}
                        </Button>
                    </Stack>
                    {!canEndDiscussion && (
                        <Typography variant="caption" color="text.secondary" display="block" mt={.75} textAlign="right">
                            {discussionWords}/{MIN_END_DISCUSSION_WORDS} words before ending
                        </Typography>
                    )}
                </Box>
            </Paper>
        </Box>
    );
}