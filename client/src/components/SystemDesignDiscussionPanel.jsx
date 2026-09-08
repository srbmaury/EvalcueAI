import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert, Box, Button, CircularProgress, Paper, Skeleton, Stack, TextField, Typography,
} from "@mui/material";
import GraphicEqRoundedIcon from "@mui/icons-material/GraphicEqRounded";
import StopCircleRoundedIcon from "@mui/icons-material/StopCircleRounded";
import { useSystemDesignDiscussion } from "../hooks/useSystemDesignDiscussion";
import { countDiscussionWords, MIN_END_DISCUSSION_WORDS } from "../utils/systemDesignDiscussion";

const SystemDesignCanvas = lazy(() => import("./SystemDesignCanvas"));

const clean = (value = "") => value.toString().replace(/\s+/g, " ").trim();

const deltaAfter = (fullText, previousText) => {
    const full = clean(fullText);
    const previous = clean(previousText);
    if (!full || full === previous) return "";
    if (!previous) return full;
    if (full.startsWith(previous)) return full.slice(previous.length).trim();

    let common = 0;
    const limit = Math.min(full.length, previous.length);
    while (common < limit && full[common] === previous[common]) common += 1;
    return full.slice(common).trim();
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
    skipAuthRedirect = false,
    supportsSTT,
    supportsTTS,
    listening,
    listeningTarget,
    interimText,
    micLevel = 0,
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
    cameraSlot = null,
}) {
    const [aiSpeaking, setAiSpeaking] = useState(false);
    const spokenProblemRef = useRef("");
    const mountedRef = useRef(true);
    const chatEndRef = useRef(null);
    const isListening = listening && listeningTarget === target;
    const discussionWords = countDiscussionWords(transcript || "");
    const canEndDiscussion = discussionWords >= MIN_END_DISCUSSION_WORDS;

    useEffect(() => () => { mountedRef.current = false; stopHandsFree?.(); }, [stopHandsFree]);

    const speakInterviewer = useCallback(async (text) => {
        if (!text) return;
        await pauseHandsFree?.();
        if (supportsTTS) {
            setAiSpeaking(true);
            await speakNow?.(text);
            if (mountedRef.current) setAiSpeaking(false);
        }
        if (mountedRef.current) await resumeHandsFree?.(target);
    }, [pauseHandsFree, resumeHandsFree, speakNow, supportsTTS, target]);

    const onInterjection = useCallback(async (item) => {
        await speakInterviewer(item.text);
    }, [speakInterviewer]);

    const { interjections } = useSystemDesignDiscussion({
        enabled: Boolean(problem && checkpointEndpoint),
        endpoint: checkpointEndpoint,
        headers: checkpointHeaders,
        transcript,
        diagramData,
        interimText,
        micLevel,
        listening: isListening,
        interviewerSpeaking: aiSpeaking,
        onInterjection,
        skipAuthRedirect,
    });

    useEffect(() => {
        if (!problem || spokenProblemRef.current === problem) return;
        spokenProblemRef.current = problem;
        let cancelled = false;
        (async () => {
            if (supportsSTT) await startHandsFree?.(target);
            if (cancelled) return;
            if (supportsTTS) await speakInterviewer(problem);
            else if (supportsSTT) await resumeHandsFree?.(target);
        })();
        return () => { cancelled = true; };
    }, [problem, resumeHandsFree, speakInterviewer, startHandsFree, supportsSTT, supportsTTS, target]);

    useEffect(() => {
        if (!problem || aiSpeaking || ending || !supportsSTT || !micSessionActive || !handsFreePaused) return;
        resumeHandsFree?.(target);
    }, [aiSpeaking, ending, handsFreePaused, micSessionActive, problem, resumeHandsFree, supportsSTT, target]);

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
    }, [discussionTurns, interjections, persistedTurns, problem, transcript]);

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
                <Suspense fallback={<Skeleton variant="rounded" height={660} />}>
                    <SystemDesignCanvas
                        value={diagramData || ""}
                        onChange={onDiagramChange}
                        label="Architecture whiteboard"
                    />
                </Suspense>
                {cameraSlot && <Box sx={{ position: "absolute", right: 18, bottom: 18, zIndex: 4 }}>{cameraSlot}</Box>}
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
                    {micPermission === "denied" && (
                        <Stack spacing={1} mb={1}>
                            <Alert severity="warning" sx={{ py: 0 }}>Microphone blocked. You can type instead.</Alert>
                            <TextField
                                fullWidth
                                multiline
                                minRows={3}
                                value={transcript || ""}
                                onChange={(event) => onTranscriptChange?.(event.target.value)}
                                placeholder="Type your response…"
                            />
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
