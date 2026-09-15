import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
    Box,
    Button,
    Chip,
    LinearProgress,
    Paper,
    Skeleton,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import VoiceControls from "./VoiceControls";
import SkipRoundButton from "./SkipRoundButton";
import WebcamPreview from "./WebcamPreview";

const CodeEditorField = lazy(() => import("./CodeEditorField"));

const OAForm = ({
    questions,
    answers,
    spokenAnswers,
    codingEnabled,
    onCodingModeChange,
    codeDraftPrefix,
    roundName = "Coding",
    onSpokenChange,
    onChange,
    onSubmit,
    onSkip,
    submitting,
    supportsTTS,
    supportsSTT,
    listening,
    listeningTarget,
    onSpeak,
    onStartListening,
    onStopListening,
    micPermission,
    micLevel,
    micSessionActive,
    handsFreePaused,
    inputDevices,
    selectedDeviceId,
    onChangeDevice,
    onStartHandsFree,
    onPauseHandsFree,
    onResumeHandsFree,
    onStopHandsFree,
    outlinedInputSx,
}) => {
    const [activeIndex, setActiveIndex] = useState(0);
    const [localDrafts, setLocalDrafts] = useState({});
    const [aiSpeaking, setAiSpeaking] = useState(false);
    const spokenQuestionKeysRef = useRef(new Set());
    const roundIntroducedRef = useRef(false);
    const total = questions?.length || 0;
    const safeIndex = Math.min(activeIndex, Math.max(total - 1, 0));
    const activeQuestion = questions?.[safeIndex];
    const activeQuestionText = activeQuestion?.question?.text || "";
    const questionSetKey = useMemo(() => (questions || []).map((item, index) => item?.question?._id || item?._id || `${index}:${item?.question?.text || ""}`).join("|"), [questions]);
    const activeQuestionKey = activeQuestion?.question?._id || activeQuestion?._id || `${safeIndex}:${activeQuestionText}`;

    useEffect(() => {
        setLocalDrafts({});
        setActiveIndex(0);
        spokenQuestionKeysRef.current = new Set();
        roundIntroducedRef.current = false;
    }, [questionSetKey]);

    useEffect(() => {
        if (!activeQuestionText || spokenQuestionKeysRef.current.has(activeQuestionKey)) return undefined;
        let cancelled = false;
        (async () => {
            if (supportsSTT) await onStartHandsFree?.(safeIndex);
            if (cancelled) return;
            if (supportsTTS) {
                // Set before the pause and the pre-speech delay below (not just around the
                // onSpeak call): the resume effect reacts to aiSpeaking, and this whole window
                // — pause, delay, then speak — is time the mic must stay paused for.
                setAiSpeaking(true);
                await onPauseHandsFree?.();
                const isRoundIntroduction = !roundIntroducedRef.current;
                await new Promise((resolve) => setTimeout(resolve, isRoundIntroduction ? 900 : 450));
                if (cancelled) return;
                const prompt = isRoundIntroduction
                    ? `Hi, welcome to the ${roundName} round. Take a moment to understand the problem. Here's your first question: ${activeQuestionText}`
                    : `Let's move to the next problem: ${activeQuestionText}`;
                spokenQuestionKeysRef.current.add(activeQuestionKey);
                roundIntroducedRef.current = true;
                await onSpeak?.(prompt);
                setAiSpeaking(false);
            } else {
                spokenQuestionKeysRef.current.add(activeQuestionKey);
                roundIntroducedRef.current = true;
            }
        })();
        return () => { cancelled = true; };
    }, [activeQuestionKey, activeQuestionText, onPauseHandsFree, onSpeak, onStartHandsFree, roundName, safeIndex, supportsSTT, supportsTTS]);

    useEffect(() => {
        // A separate effect, deliberately not folded into the speak effect above: onResumeHandsFree
        // isn't referentially stable across renders, so if it sat in that effect's dependency array,
        // an unrelated prop-identity change mid-utterance would cancel the effect before the resume
        // call at the end ever ran, leaving the mic paused ("interviewer speaking") forever even after
        // TTS actually finished. Driving the resume off aiSpeaking/handsFreePaused state instead means
        // it retries on every re-render until the mic is actually resumed.
        if (!supportsSTT || !micSessionActive || !handsFreePaused || aiSpeaking || submitting) return;
        let cancelled = false;
        (async () => { await onResumeHandsFree?.(safeIndex); if (cancelled) return; })();
        return () => { cancelled = true; };
    }, [aiSpeaking, handsFreePaused, micSessionActive, onResumeHandsFree, safeIndex, submitting, supportsSTT]);

    useEffect(() => () => { onStopHandsFree?.(); }, [onStopHandsFree]);

    const effectiveAnswers = useMemo(() => Array.from({ length: total }, (_, index) => (
        Object.prototype.hasOwnProperty.call(localDrafts, index)
            ? String(localDrafts[index] ?? "")
            : String(answers?.[index] ?? "")
    )), [answers, localDrafts, total]);

    const answeredCount = useMemo(
        () => (questions || []).reduce((count, _question, index) => {
            const written = effectiveAnswers[index]?.trim() || "";
            const spoken = String(spokenAnswers?.[index] || "").trim();
            return count + (written || spoken ? 1 : 0);
        }, 0),
        [effectiveAnswers, questions, spokenAnswers],
    );
    const progress = total ? ((safeIndex + 1) / total) * 100 : 0;
    const remaining = Math.max(total - answeredCount, 0);

    if (!total) {
        return (
            <Paper variant="outlined" sx={{ p: 3, mt: 2 }}>
                <Typography color="text.secondary">Preparing assessment questions…</Typography>
            </Paper>
        );
    }

    const goPrevious = () => setActiveIndex((current) => Math.max(0, current - 1));
    const goNext = () => setActiveIndex((current) => Math.min(total - 1, current + 1));
    const handleDraftChange = (index, value) => {
        setLocalDrafts((current) => ({ ...current, [index]: value }));
        onChange(index, value);
    };

    return (
        <Stack spacing={2} mt={2}>
            <Paper variant="outlined" sx={{ overflow: "hidden", borderRadius: 3, boxShadow: "0 12px 36px rgba(15, 23, 42, 0.06)", position: "relative" }}>
                <Box sx={{ px: { xs: 2, md: 2.5 }, pt: 2, pb: 1.5, bgcolor: "action.hover" }}>
                    <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1.5} alignItems={{ sm: "center" }}>
                        <Box>
                            <Typography variant="overline" color="primary.main" fontWeight={800}>Online assessment · Problem {safeIndex + 1} of {total}</Typography>
                            <Typography variant="body2" color="text.secondary">Your work autosaves. Move between problems whenever you need to.</Typography>
                        </Box>
                        <Stack direction="row" spacing={1} alignItems="center">
                            <Chip size="small" icon={<CheckCircleRoundedIcon />} label={`${answeredCount}/${total} answered`} color={answeredCount === total ? "success" : "default"} variant="outlined" />
                            <Chip size="small" label={remaining ? `${remaining} remaining` : "Ready to finish"} color={remaining ? "default" : "success"} />
                        </Stack>
                    </Stack>
                    <LinearProgress variant="determinate" value={progress} sx={{ mt: 1.5, height: 5, borderRadius: 999 }} />
                </Box>

                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(300px, 0.72fr) minmax(0, 1.28fr)" }, minHeight: { lg: 560 } }}>
                    <Box sx={{ p: { xs: 2, md: 2.5 }, borderRight: { lg: "1px solid" }, borderBottom: { xs: "1px solid", lg: 0 }, borderColor: "divider", bgcolor: "background.paper" }}>
                        <Stack spacing={2} sx={{ position: { lg: "sticky" }, top: { lg: 92 } }}>
                            <Box>
                                <Typography variant="caption" color="text.secondary" fontWeight={800}>PROBLEM STATEMENT</Typography>
                                <Typography component="h2" variant="h5" fontWeight={800} sx={{ lineHeight: 1.45, mt: .5 }}>{activeQuestionText || "(question text unavailable)"}</Typography>
                            </Box>
                            <VoiceControls
                                target={safeIndex}
                                speakText={activeQuestionText}
                                supportsTTS={supportsTTS}
                                supportsSTT={supportsSTT}
                                listening={listening}
                                listeningTarget={listeningTarget}
                                onSpeak={onSpeak}
                                onStartListening={onStartListening}
                                onStopListening={onStopListening}
                                micPermission={micPermission}
                                micLevel={micLevel}
                                inputDevices={inputDevices}
                                selectedDeviceId={selectedDeviceId}
                                onChangeDevice={onChangeDevice}
                                handsFree
                                micSessionActive={micSessionActive}
                                handsFreePaused={handsFreePaused}
                                onStartHandsFree={onStartHandsFree}
                            />
                            <Box>
                                <Typography variant="caption" color="text.secondary" fontWeight={800}>PROBLEM NAVIGATION</Typography>
                                <Box sx={{ display: "flex", gap: .75, flexWrap: "wrap", mt: 1 }} aria-label="Question navigation">
                                    {questions.map((_question, index) => {
                                        const answered = Boolean(effectiveAnswers[index]?.trim() || String(spokenAnswers?.[index] || "").trim());
                                        return <Button key={index} size="small" variant={index === safeIndex ? "contained" : "outlined"} color={answered && index !== safeIndex ? "success" : "primary"} onClick={() => setActiveIndex(index)} disabled={submitting} aria-label={`Go to question ${index + 1}${answered ? ", answered" : ""}`} sx={{ minWidth: 40, borderRadius: 2 }}>{index + 1}</Button>;
                                    })}
                                </Box>
                            </Box>
                        </Stack>
                    </Box>

                    <Box sx={{ p: { xs: 2, md: 2.5 }, minWidth: 0, bgcolor: "background.default" }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={800}>WORKSPACE</Typography>
                        <Box sx={{ mt: 1 }}>
                            <Suspense fallback={<Skeleton variant="rectangular" height={430} sx={{ borderRadius: 2 }} />}>
                                <CodeEditorField value={effectiveAnswers[safeIndex] || ""} onChange={(value) => handleDraftChange(safeIndex, value)} onModeChange={(enabled) => onCodingModeChange(safeIndex, enabled)} draftKey={`${codeDraftPrefix}:${safeIndex}`} suggestCode={/\b(code|implement|algorithm|data structure|complexity|function|program)\b/i.test(activeQuestionText)} minRows={16} outlinedInputSx={outlinedInputSx} />
                            </Suspense>
                        </Box>
                        {codingEnabled?.[safeIndex] && <TextField label="Explain your approach" value={spokenAnswers?.[safeIndex] || ""} onChange={(event) => onSpokenChange(safeIndex, event.target.value)} multiline minRows={3} fullWidth sx={{ mt: 2 }} helperText="Optional: reasoning, complexity, assumptions, or trade-offs." />}
                        <Box
                            data-testid="online-assessment-camera-slot"
                            sx={{ position: "relative", height: { xs: 104, sm: 131 }, mt: 2 }}
                        >
                            <WebcamPreview autoStart required />
                        </Box>
                    </Box>
                </Box>

                <Box sx={{ px: { xs: 2, md: 2.5 }, py: 1.75, borderTop: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}>
                    <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={1.5} alignItems={{ md: "center" }}>
                        <Stack direction="row" spacing={1}>
                            <Button startIcon={<ArrowBackRoundedIcon />} onClick={goPrevious} disabled={safeIndex === 0 || submitting}>Previous</Button>
                            {safeIndex < total - 1 && <Button variant="outlined" endIcon={<ArrowForwardRoundedIcon />} onClick={goNext} disabled={submitting}>Next problem</Button>}
                        </Stack>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
                            <Button variant="contained" onClick={onSubmit} disabled={submitting} sx={{ minWidth: 170 }}>{submitting ? "Finishing…" : "Finish coding round"}</Button>
                            <SkipRoundButton onSkip={onSkip} />
                        </Stack>
                    </Stack>
                </Box>
            </Paper>
        </Stack>
    );
};

export default OAForm;