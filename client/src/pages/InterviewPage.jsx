import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { useInterviewSession } from "../hooks/useInterviewSession";
import { useConversational } from "../hooks/useConversational";
import { useOAForm } from "../hooks/useOAForm";
import { useVoiceInput } from "../hooks/useVoiceInput";
import { useResumePdf } from "../hooks/useResumePdf";
import api from "../api/axios";
import CandidateIntroCard from "../components/CandidateIntroCard";

import {
    Alert, Box, Button, Chip, CircularProgress,
    LinearProgress, Paper, Stack, Typography, Dialog, DialogTitle,
    DialogContent, DialogActions,
} from "@mui/material";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import HelpPopover from "../components/HelpPopover";

import ConversationalPanel from "../components/ConversationalPanel";
import SystemDesignDiscussionPanel from "../components/SystemDesignDiscussionPanel";
import FeedbackPanel from "../components/FeedbackPanel";
import OAForm from "../components/OAForm";
import InterviewRoundsOverview from "../components/InterviewRoundsOverview";
import { composeAnswerParts } from "../utils/answerParts";
import { storage, storageKeys } from "../utils/interviewStorage";
import { describeError } from "../utils/errorFormatter";

const outlinedInputSx = {
    "& .MuiOutlinedInput-root": {
        "& fieldset": { borderColor: "#c4c4c4" },
        "&:hover fieldset": { borderColor: "#1976d2" },
        "&.Mui-focused fieldset": { borderColor: "#1976d2", borderWidth: 2 },
    },
};

const InterviewPage = () => {
    const { interviewId } = useParams();
    const [inlineStatus, setInlineStatus] = useState({ open: false, severity: "info", message: "" });
    const showToast = useCallback((severity, message, persistent = false) => {
        setInlineStatus({ open: true, severity, message });
        if (!persistent && severity !== "error") {
            setTimeout(() => setInlineStatus((state) => ({ ...state, open: false })), 4000);
        }
    }, []);

    const [showRoundsOverview, setShowRoundsOverview] = useState(() => !storage.get(storageKeys.selRound(interviewId)));
    const [resumeOpen, setResumeOpen] = useState(false);
    const [systemDesignDiagram, setSystemDesignDiagram] = useState("");
    const [systemDesignEnding, setSystemDesignEnding] = useState(false);

    const {
        interview, setInterview,
        selectedRound, setSelectedRound, selectRound,
        roundLocked,
        loadingRound, roundPrepareProgress,
        prepError, retryPrep,
        allRoundsCompleted,
        clearDraftsForRound, handleSkipRound,
    } = useInterviewSession(interviewId, showToast);

    const enterRound = useCallback((round) => {
        selectRound(round);
        setShowRoundsOverview(false);
    }, [selectRound]);

    const isConversational = useMemo(
        () => selectedRound?.deliveryMode === "conversational",
        [selectedRound],
    );
    const isSystemDesign = useMemo(() => Boolean(
        isConversational && /system\s*design|architecture/i.test(`${selectedRound?.name || ""} ${selectedRound?.description || ""}`),
    ), [isConversational, selectedRound?.description, selectedRound?.name]);

    // One unscored intro at the very start of the interview (before round 1, whatever its format),
    // while the round prepares in the background.
    const firstRoundId = interview?.rounds?.[0]?.round?._id;
    const showCandidateIntro = Boolean(
        interview && !interview.candidateIntroAt
        && selectedRound?._id && selectedRound._id === firstRoundId
        && selectedRound.status !== "completed"
        && !(selectedRound.questions || []).some((item) => item?.answerGiven),
    );
    const saveCandidateIntro = useCallback(async (body) => {
        const { data } = await api.put(`/interviews/${interviewId}/intro`, body);
        setInterview((current) => (current ? { ...current, ...data } : current));
    }, [interviewId, setInterview]);

    const hasAnsweredMissingFeedback = useMemo(() => {
        const questions = selectedRound?.questions || [];
        return questions.some((question) => (question?.answerGiven || "").toString().trim() && !question?.feedback);
    }, [selectedRound?.questions]);

    const pendingFeedbackNotice = hasAnsweredMissingFeedback ? (
        <Alert severity="info">
            Some detailed feedback is still being prepared. The round is saved, and the page will show any available feedback without needing a manual refresh.
        </Alert>
    ) : null;

    const convAnswerSetterRef = useRef(null);
    const oaAnswersSetterRef = useRef(null);
    const [convSpokenAnswer, setConvSpokenAnswer] = useState("");
    const [oaSpokenAnswers, setOaSpokenAnswers] = useState([]);
    const [convCodingEnabled, setConvCodingEnabled] = useState(false);
    const [oaCodingEnabled, setOaCodingEnabled] = useState([]);

    const onTranscript = useCallback((target, text) => {
        if (window.speechSynthesis?.speaking) return;
        if (target === "conv") {
            if (convCodingEnabled && !isSystemDesign) setConvSpokenAnswer((previous) => (previous ? `${previous} ${text}` : text));
            else convAnswerSetterRef.current?.((previous) => (previous ? `${previous} ${text}` : text));
        } else if (typeof target === "number") {
            const setter = oaCodingEnabled[target] ? setOaSpokenAnswers : oaAnswersSetterRef.current;
            setter?.((previous) => {
                const next = [...previous];
                next[target] = ((next[target] || "") + " " + text).trimStart();
                return next;
            });
        }
    }, [convCodingEnabled, isSystemDesign, oaCodingEnabled]);

    const {
        listening, listeningTarget, interimText,
        micLevel, isSpeaking, micPermission, micSessionActive, handsFreePaused,
        inputDevices, selectedDeviceId, setSelectedDeviceId,
        supportsSTT, supportsTTS,
        startListening, stopListening, speakNow,
        startHandsFree, pauseHandsFree, resumeHandsFree, stopHandsFree,
    } = useVoiceInput({ onTranscript });

    const {
        convViewState,
        convAnswer, setConvAnswer,
        convSavedAt,
        convSubmitting, convRoundSubmitting, convFeedbackProgress,
        pendingFollowUp,
        handleSubmitAnswer, handleFollowUpDone, handleClarify, handleCompleteRound,
    } = useConversational({
        interviewId, selectedRound, isConversational,
        setSelectedRound, selectRound, setInterview,
        showToast, clearDraftsForRound,
    });
    convAnswerSetterRef.current = setConvAnswer;

    const {
        oaAnswers, setOaAnswers,
        oaSubmitting, oaFeedbackProgress,
        handleOAChange, handleOASubmit,
    } = useOAForm({
        interviewId, selectedRound, isConversational, roundLocked,
        selectRound, setInterview,
        showToast, clearDraftsForRound,
    });
    oaAnswersSetterRef.current = setOaAnswers;

    useEffect(() => {
        if (!selectedRound?._id || !isConversational || convViewState.done) return;
        const index = convViewState.index || 0;
        setConvSpokenAnswer(storage.get(storageKeys.convVoice(interviewId, selectedRound._id, index)) || "");
        setConvCodingEnabled(isSystemDesign ? false : Boolean(storage.get(storageKeys.convCoding(interviewId, selectedRound._id, index))));
    }, [interviewId, selectedRound?._id, isConversational, isSystemDesign, convViewState.index, convViewState.done]);

    useEffect(() => {
        if (!selectedRound?._id || !isConversational || convViewState.done) return;
        const index = convViewState.index || 0;
        storage.set(storageKeys.convVoice(interviewId, selectedRound._id, index), convSpokenAnswer);
        storage.set(storageKeys.convCoding(interviewId, selectedRound._id, index), convCodingEnabled);
    }, [interviewId, selectedRound?._id, isConversational, convViewState.index, convViewState.done, convSpokenAnswer, convCodingEnabled]);

    useEffect(() => {
        if (!selectedRound?._id || isConversational) return;
        setOaSpokenAnswers(storage.get(storageKeys.oaVoice(interviewId, selectedRound._id)) || []);
        setOaCodingEnabled(storage.get(storageKeys.oaCoding(interviewId, selectedRound._id)) || []);
    }, [interviewId, selectedRound?._id, isConversational]);

    useEffect(() => {
        if (!selectedRound?._id || isConversational) return;
        storage.set(storageKeys.oaVoice(interviewId, selectedRound._id), oaSpokenAnswers);
        storage.set(storageKeys.oaCoding(interviewId, selectedRound._id), oaCodingEnabled);
    }, [interviewId, selectedRound?._id, isConversational, oaSpokenAnswers, oaCodingEnabled]);

    const systemDesignStorageKey = useMemo(() => selectedRound?._id ? `system-design-canvas:${interviewId}:${selectedRound._id}` : "", [interviewId, selectedRound?._id]);
    useEffect(() => {
        if (!isSystemDesign || !systemDesignStorageKey) { setSystemDesignDiagram(""); return; }
        const currentItem = selectedRound?.questions?.[convViewState.index || 0];
        let local = "";
        try { local = window.localStorage?.getItem(systemDesignStorageKey) || ""; } catch { void 0; }
        setSystemDesignDiagram(local || currentItem?.diagramData || "");
    }, [convViewState.index, isSystemDesign, selectedRound?.questions, systemDesignStorageKey]);

    const updateSystemDesignDiagram = useCallback((value) => {
        setSystemDesignDiagram(value);
        if (!systemDesignStorageKey) return;
        try { window.localStorage?.setItem(systemDesignStorageKey, value); } catch { void 0; }
    }, [systemDesignStorageKey]);

    const changeConversationalCodingMode = useCallback((enabled) => {
        if (isSystemDesign) return;
        setConvCodingEnabled(enabled);
        if (!enabled && convSpokenAnswer.trim()) {
            setConvAnswer((current) => `${current}${current ? "\n\n" : ""}${convSpokenAnswer}`);
            setConvSpokenAnswer("");
        }
    }, [convSpokenAnswer, isSystemDesign, setConvAnswer]);

    const changeOaCodingMode = useCallback((index, enabled) => {
        setOaCodingEnabled((current) => {
            const next = [...current];
            next[index] = enabled;
            return next;
        });
        if (!enabled && (oaSpokenAnswers[index] || "").trim()) {
            setOaAnswers((current) => {
                const next = [...current];
                next[index] = `${next[index] || ""}${next[index] ? "\n\n" : ""}${oaSpokenAnswers[index]}`;
                return next;
            });
            setOaSpokenAnswers((current) => {
                const next = [...current];
                next[index] = "";
                return next;
            });
        }
    }, [oaSpokenAnswers, setOaAnswers]);

    const submitConversationalAnswer = useCallback(async () => {
        await handleSubmitAnswer(composeAnswerParts(convAnswer, convSpokenAnswer));
        setConvSpokenAnswer("");
    }, [convAnswer, convSpokenAnswer, handleSubmitAnswer]);

    const finishFollowUp = useCallback(async ({ skip = false } = {}) => {
        await handleFollowUpDone(skip ? "" : composeAnswerParts(convAnswer, convSpokenAnswer));
        setConvSpokenAnswer("");
    }, [convAnswer, convSpokenAnswer, handleFollowUpDone]);

    const endSystemDesignDiscussion = useCallback(async () => {
        if (!selectedRound?._id || !convAnswer.trim()) return false;
        setSystemDesignEnding(true);
        try {
            await api.post(`/questions/${selectedRound._id}/system-design/complete`, {
                transcript: convAnswer,
                diagramData: systemDesignDiagram,
                previousInterjections: [],
            });
            try { if (systemDesignStorageKey) window.localStorage?.removeItem(systemDesignStorageKey); } catch { void 0; }
            await handleCompleteRound();
            return true;
        } catch (error) {
            showToast("error", describeError(error, "Could not save the system-design discussion."));
            return false;
        } finally {
            setSystemDesignEnding(false);
        }
    }, [convAnswer, handleCompleteRound, selectedRound?._id, showToast, systemDesignDiagram, systemDesignStorageKey]);

    const submitOaAnswers = useCallback(async () => {
        const combined = Array.from(
            { length: Math.max(oaAnswers.length, oaSpokenAnswers.length) },
            (_, index) => composeAnswerParts(oaAnswers[index], oaSpokenAnswers[index]),
        );
        await handleOASubmit(combined);
        setOaSpokenAnswers([]);
    }, [handleOASubmit, oaAnswers, oaSpokenAnswers]);

    const resumeId = interview?.resume?._id || "";
    const resumeName = interview?.resume?.fileName || "resume";
    const resumeFileType = interview?.resume?.fileType || "";
    const resumePreviewPath = resumeId ? `/resumes/${resumeId}/preview` : "";
    const resumeBlobUrl = useResumePdf({ resumeOpen, resumePreviewPath, resumeFileType });
    const downloadResume = useCallback(async () => {
        if (!resumeId) return;
        try {
            const { data } = await api.get(`/resumes/${resumeId}/file`, { responseType: "blob" });
            const objectUrl = URL.createObjectURL(data);
            const anchor = document.createElement("a");
            anchor.href = objectUrl;
            anchor.download = resumeName;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
        } catch (error) {
            showToast("error", error?.response?.data?.message || "Resume could not be downloaded.");
        }
    }, [resumeId, resumeName, showToast]);

    const voiceProps = useMemo(() => ({
        supportsTTS, supportsSTT,
        listening, listeningTarget, interimText,
        onSpeak: speakNow,
        onStartListening: startListening,
        onStopListening: stopListening,
        micPermission, micLevel, isSpeaking, micSessionActive, handsFreePaused,
        inputDevices, selectedDeviceId,
        onChangeDevice: setSelectedDeviceId,
        onStartHandsFree: startHandsFree,
        onPauseHandsFree: pauseHandsFree,
        onResumeHandsFree: resumeHandsFree,
        onStopHandsFree: stopHandsFree,
        pushToTalk: false,
        outlinedInputSx,
    }), [
        supportsTTS, supportsSTT, listening, listeningTarget, interimText, speakNow,
        startListening, stopListening, micPermission, micLevel, isSpeaking, micSessionActive, handsFreePaused,
        inputDevices, selectedDeviceId, setSelectedDeviceId, startHandsFree, pauseHandsFree,
        resumeHandsFree, stopHandsFree,
    ]);

    const roundMeta = useMemo(() => {
        const rounds = interview?.rounds || [];
        const index = Math.max(0, rounds.findIndex((item) => item.round?._id === selectedRound?._id));
        const completed = rounds.filter((item) => item.round?.status === "completed").length;
        return {
            index,
            total: rounds.length,
            completed,
            progress: rounds.length ? Math.min(100, (completed / rounds.length) * 100) : 0,
        };
    }, [interview?.rounds, selectedRound?._id]);

    // Preparing questions marks a round in_progress before the user enters it, so "started" means answers exist.
    const roundHasProgress = (round) => round?.status === "completed" || (round?.questions || []).some((item) => item?.answerGiven);

    // Rounds run in order, so the primary overview action points at the first unfinished round
    // once the selected one is done (or nothing has been selected yet).
    const firstUnfinishedRound = useMemo(() => {
        if (selectedRound && selectedRound.status !== "completed") return null;
        const rounds = interview?.rounds || [];
        const index = rounds.findIndex((item) => item.round && item.round.status !== "completed");
        return index >= 0 ? { round: rounds[index].round, number: index + 1 } : null;
    }, [interview?.rounds, selectedRound]);

    const nextRound = useMemo(() => {
        if (!selectedRound || roundMeta.index < 0) return null;
        return interview?.rounds?.[roundMeta.index + 1]?.round || null;
    }, [interview?.rounds, roundMeta.index, selectedRound]);

    const modeLabel = isSystemDesign
        ? "System design"
        : selectedRound?.deliveryMode === "conversational"
            ? "Conversation"
            : "Online assessment";

    const completedRoundActions = selectedRound?.status === "completed" ? (
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 3 }}>
            <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1.5} alignItems={{ sm: "center" }}>
                <Box>
                    <Typography fontWeight={850}>Round complete</Typography>
                    <Typography variant="body2" color="text.secondary">Review this debrief, then choose when to move to the next interview stage.</Typography>
                </Box>
                <Stack direction={{ xs: "column", sm: "row" }} gap={1}>
                    <Button variant="outlined" onClick={() => setShowRoundsOverview(true)}>Back to rounds</Button>
                    {nextRound && <Button variant="contained" onClick={() => enterRound(nextRound)}>Continue to {nextRound.name}</Button>}
                </Stack>
            </Stack>
        </Paper>
    ) : null;

    if (!interview) {
        return (
            <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <>
            <Box sx={{ bgcolor: "background.default", minHeight: "calc(100vh - 64px)", py: { xs: 1.5, md: 2.5 } }}>
                <Box sx={{ width: "100%", maxWidth: 1500, mx: "auto", px: { xs: 1.5, sm: 2.5, lg: 3 } }}>
                    <Paper
                        variant="outlined"
                        sx={{
                            mb: 2,
                            px: { xs: 1.5, md: 2.25 },
                            py: 1.5,
                            borderRadius: 3,
                            position: { md: "sticky" },
                            top: { md: 8 },
                            zIndex: 20,
                            backdropFilter: "blur(12px)",
                            bgcolor: "background.paper",
                        }}
                    >
                        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={1.5} alignItems={{ md: "center" }}>
                            <Box sx={{ minWidth: 0 }}>
                                <Stack direction="row" spacing={.75} alignItems="center" flexWrap="wrap" useFlexGap>
                                    <Typography fontWeight={850} noWrap>
                                        {showRoundsOverview ? "Interview rounds" : selectedRound?.name || "Interview"}
                                    </Typography>
                                    {!showRoundsOverview && selectedRound && <Chip size="small" label={modeLabel} color="primary" variant="outlined" />}
                                    {!showRoundsOverview && selectedRound?.status === "completed" && <Chip size="small" icon={<CheckCircleRoundedIcon />} label="Completed" color="success" />}
                                </Stack>
                                <Typography variant="caption" color="text.secondary">
                                    {showRoundsOverview
                                        ? `${roundMeta.completed} of ${roundMeta.total} rounds completed`
                                        : `${roundMeta.total ? `Round ${roundMeta.index + 1} of ${roundMeta.total}` : "Interview"}${selectedRound?.description ? ` · ${selectedRound.description}` : ""}`}
                                </Typography>
                            </Box>

                            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                {showRoundsOverview ? (
                                    firstUnfinishedRound ? (
                                        <Button size="small" variant="contained" onClick={() => enterRound(firstUnfinishedRound.round)}>
                                            {`${roundHasProgress(firstUnfinishedRound.round) ? "Continue" : "Start"} round ${firstUnfinishedRound.number}`}
                                        </Button>
                                    ) : selectedRound && (
                                        <Button size="small" variant="contained" onClick={() => setShowRoundsOverview(false)}>
                                            {selectedRound.status === "completed" ? `View round ${roundMeta.index + 1}` : roundHasProgress(selectedRound) ? "Return to round" : `Start round ${roundMeta.index + 1}`}
                                        </Button>
                                    )
                                ) : (
                                    <Button size="small" variant="outlined" onClick={() => setShowRoundsOverview(true)}>
                                        Rounds
                                    </Button>
                                )}
                                {allRoundsCompleted && Number.isFinite(Number(interview?.overallScore)) && (
                                    <Chip color="primary" label={`Overall score ${interview.overallScore}/10`} />
                                )}
                                {resumeId && (
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        onClick={() => {
                                            if (resumeFileType === "application/pdf") setResumeOpen(true);
                                            else downloadResume();
                                        }}
                                    >
                                        View resume
                                    </Button>
                                )}
                                <HelpPopover />
                            </Stack>
                        </Stack>
                        <LinearProgress variant="determinate" value={roundMeta.progress} sx={{ mt: 1.25, height: 4, borderRadius: 999 }} />
                    </Paper>

                    {inlineStatus.open && (
                        <Alert
                            severity={inlineStatus.severity}
                            aria-live={inlineStatus.severity === "error" ? undefined : "polite"}
                            role={inlineStatus.severity === "error" ? "alert" : undefined}
                            sx={{ mb: 2 }}
                            onClose={() => setInlineStatus((state) => ({ ...state, open: false }))}
                        >
                            {inlineStatus.message}
                        </Alert>
                    )}

                    {showRoundsOverview ? (
                        <InterviewRoundsOverview
                            interview={interview}
                            selectedRoundId={selectedRound?._id}
                            onSelect={enterRound}
                        />
                    ) : (
                        <Box component="main" sx={{ minWidth: 0, maxWidth: isSystemDesign ? 1380 : 1220, mx: "auto" }}>
                            {!selectedRound ? (
                                <Paper variant="outlined" sx={{ p: 4, textAlign: "center", borderRadius: 3 }}>
                                    <Stack spacing={1.5} alignItems="center">
                                        <Typography fontWeight={800}>Choose an interview round to begin.</Typography>
                                        <Button variant="contained" onClick={() => setShowRoundsOverview(true)}>View rounds</Button>
                                    </Stack>
                                </Paper>
                            ) : showCandidateIntro ? (
                                <CandidateIntroCard onSubmit={(answer) => saveCandidateIntro({ answer })} onSkip={() => saveCandidateIntro({ skip: true })} />
                            ) : loadingRound ? (
                                <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 3 }}>
                                    <Stack spacing={1.5}>
                                        <Typography fontWeight={800}>
                                            Interviewer is preparing this round{roundPrepareProgress ? ` · ${Math.min(100, Math.max(0, Math.round(roundPrepareProgress)))}%` : ""}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">Questions are being tailored to the role and your interview context.</Typography>
                                        <LinearProgress
                                            variant={roundPrepareProgress ? "determinate" : "indeterminate"}
                                            value={Math.min(100, Math.max(0, roundPrepareProgress || 0))}
                                        />
                                    </Stack>
                                </Paper>
                            ) : prepError ? (
                                <Stack spacing={1}>
                                    <Alert severity="error">{prepError}</Alert>
                                    <Button variant="outlined" onClick={retryPrep}>Retry</Button>
                                </Stack>
                            ) : isConversational ? (
                                selectedRound.status === "completed" ? (
                                    convRoundSubmitting ? (
                                        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
                                            <Stack spacing={1}>
                                                <Typography fontWeight={800}>Generating interview feedback… {convFeedbackProgress ? `${Math.round(convFeedbackProgress)}%` : ""}</Typography>
                                                <LinearProgress variant={convFeedbackProgress ? "determinate" : "indeterminate"} value={convFeedbackProgress || 0} />
                                            </Stack>
                                        </Paper>
                                    ) : <Stack spacing={2}>{pendingFeedbackNotice}<FeedbackPanel round={selectedRound} />{completedRoundActions}</Stack>
                                ) : isSystemDesign ? (
                                    <SystemDesignDiscussionPanel
                                        problem={convViewState.current?.text || ""}
                                        transcript={convAnswer}
                                        onTranscriptChange={setConvAnswer}
                                        diagramData={systemDesignDiagram}
                                        onDiagramChange={updateSystemDesignDiagram}
                                        target="conv"
                                        checkpointEndpoint={`/questions/${selectedRound._id}/system-design/checkpoint`}
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
                                        onEnd={endSystemDesignDiscussion}
                                        ending={systemDesignEnding || convRoundSubmitting}
                                        savedLabel={convSavedAt ? "Transcript recovery is active" : "Transcript and whiteboard recover automatically"}
                                    />
                                ) : (
                                    <>
                                        <ConversationalPanel
                                            questionTotal={selectedRound.adaptiveState?.enabled ? (Number(selectedRound.adaptiveState?.maxQuestions) || Number(selectedRound.questionLimit) || 0) : (Number(selectedRound.questionLimit) || (selectedRound.questions || []).length)}
                                            questionTotalIsMax={Boolean(selectedRound.adaptiveState?.enabled)}
                                            convSubmitting={convSubmitting}
                                            convRoundSubmitting={convRoundSubmitting}
                                            convState={convViewState}
                                            convAnswer={convAnswer}
                                            setConvAnswer={setConvAnswer}
                                            spokenAnswer={convSpokenAnswer}
                                            setSpokenAnswer={setConvSpokenAnswer}
                                            codingEnabled={convCodingEnabled}
                                            onCodingModeChange={changeConversationalCodingMode}
                                            codeDraftKey={`${interviewId}:${selectedRound._id}:${convViewState.index}`}
                                            onSubmitAnswer={submitConversationalAnswer}
                                            onClarify={handleClarify}
                                            onCompleteRound={handleCompleteRound}
                                            onSkip={handleSkipRound}
                                            savedAt={convSavedAt}
                                            target="conv"
                                            pendingFollowUp={pendingFollowUp}
                                            onFollowUpDone={finishFollowUp}
                                            {...voiceProps}
                                        />
                                        {convRoundSubmitting && (
                                            <Stack spacing={.5} sx={{ mt: 1 }}>
                                                <Typography variant="body2">Generating feedback… {convFeedbackProgress ? `${Math.round(convFeedbackProgress)}%` : ""}</Typography>
                                                <LinearProgress variant={convFeedbackProgress ? "determinate" : "indeterminate"} value={convFeedbackProgress || 0} />
                                            </Stack>
                                        )}
                                    </>
                                )
                            ) : (
                                selectedRound.status === "completed" ? (
                                    oaSubmitting ? (
                                        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
                                            <Stack spacing={1}>
                                                <Typography fontWeight={800}>Generating interview feedback… {oaFeedbackProgress ? `${Math.round(oaFeedbackProgress)}%` : ""}</Typography>
                                                <LinearProgress variant={oaFeedbackProgress ? "determinate" : "indeterminate"} value={oaFeedbackProgress || 0} />
                                            </Stack>
                                        </Paper>
                                    ) : <Stack spacing={2}>{pendingFeedbackNotice}<FeedbackPanel round={selectedRound} />{completedRoundActions}</Stack>
                                ) : (
                                    <>
                                        <OAForm
                                            questions={selectedRound.questions}
                                            answers={oaAnswers}
                                            spokenAnswers={oaSpokenAnswers}
                                            codingEnabled={oaCodingEnabled}
                                            onCodingModeChange={changeOaCodingMode}
                                            codeDraftPrefix={`${interviewId}:${selectedRound._id}`}
                                            roundName={selectedRound.name}
                                            onSpokenChange={(index, value) => setOaSpokenAnswers((current) => {
                                                const next = [...current];
                                                next[index] = value;
                                                return next;
                                            })}
                                            onChange={handleOAChange}
                                            onSubmit={submitOaAnswers}
                                            onSkip={handleSkipRound}
                                            submitting={oaSubmitting}
                                            {...voiceProps}
                                        />
                                        {oaSubmitting && (
                                            <Stack spacing={.5} sx={{ mt: 1 }}>
                                                <Typography variant="body2">Generating feedback… {oaFeedbackProgress ? `${Math.round(oaFeedbackProgress)}%` : ""}</Typography>
                                                <LinearProgress variant={oaFeedbackProgress ? "determinate" : "indeterminate"} value={oaFeedbackProgress || 0} />
                                            </Stack>
                                        )}
                                    </>
                                )
                            )}
                        </Box>
                    )}
                </Box>
            </Box>

            <Dialog
                open={resumeOpen}
                onClose={() => setResumeOpen(false)}
                fullWidth
                maxWidth="xl"
                PaperProps={{ sx: { height: "92vh" } }}
                aria-labelledby="resume-dialog-title"
            >
                <DialogTitle id="resume-dialog-title">Resume</DialogTitle>
                <DialogContent dividers sx={{ p: 0, height: "100%" }}>
                    {resumeFileType === "application/pdf" ? (
                        resumeBlobUrl
                            ? <iframe src={resumeBlobUrl} title="Resume Preview" width="100%" height="100%" style={{ border: 0 }} />
                            : <Box sx={{ p: 2 }}><Typography color="text.secondary">Loading resume…</Typography></Box>
                    ) : (
                        <Box sx={{ p: 2 }}><Typography>Preview available for PDFs only.</Typography></Box>
                    )}
                </DialogContent>
                <DialogActions>
                    {resumeId && <Button onClick={downloadResume}>Download</Button>}
                    <Button onClick={() => setResumeOpen(false)} autoFocus>Close</Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default InterviewPage;
