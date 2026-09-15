import { useState, useCallback, useEffect, useMemo } from "react";
import api from "../api/axios";
import { storage, storageKeys } from "../utils/interviewStorage";
import { pollJobStatus } from "../utils/pollJobStatus";
import { trackEvent } from "../utils/analytics";
import { describeError } from "../utils/errorFormatter";

const pendingFollowUpFor = (item) => {
    const followUps = Array.isArray(item?.followUps) ? item.followUps : [];
    for (let i = followUps.length - 1; i >= 0; i -= 1) {
        const followUp = followUps[i];
        if (followUp?.question && !followUp?.answer && !followUp?.skipped) return { question: followUp.question, number: i + 1 };
    }
    return null;
};

const composeFeedbackAnswer = (item) => {
    const original = (item?.answerGiven || "").toString().trim();
    const liveDiscussion = (Array.isArray(item?.discussionTurns) ? item.discussionTurns : [])
        .filter((turn) => turn?.text)
        .map((turn) => `${turn.speaker === "interviewer" ? "Interviewer" : "Candidate"}: ${turn.text}`)
        .join("\n");
    const followUps = (item?.followUps || [])
        .filter((followUp) => followUp?.question && followUp?.answer && !followUp?.skipped)
        .map((followUp, index) => `Follow-up ${index + 1}: ${followUp.question}\nFollow-up answer ${index + 1}: ${followUp.answer}`);
    return [liveDiscussion ? `Live interviewer discussion:\n${liveDiscussion}` : original, ...followUps].filter(Boolean).join("\n\n").trim();
};

const completedRoundMessage = (feedbackResult) => feedbackResult === "completed"
    ? "Round complete. Your feedback is ready to review."
    : "Round complete. Review the debrief or overall feedback page when you’re ready.";

export const useConversational = ({
    interviewId,
    selectedRound,
    isConversational,
    selectRound,
    setInterview,
    showToast,
    clearDraftsForRound,
}) => {
    const [convState, setConvState] = useState({ index: 0, current: null, done: false });
    const [convAnswer, setConvAnswer] = useState("");
    const [convSavedAt, setConvSavedAt] = useState(null);
    const [convSubmitting, setConvSubmitting] = useState(false);
    const [convRoundSubmitting, setConvRoundSubmitting] = useState(false);
    const [convFeedbackProgress, setConvFeedbackProgress] = useState(0);
    const [pendingFollowUp, setPendingFollowUp] = useState(null);

    const syncConvStateFromRound = useCallback((round) => {
        if (!round || round.deliveryMode !== "conversational") return;
        const limit = Math.min(Number(round.questionLimit) || 8, round.questions?.length || 0);
        if (round.status === "completed") {
            setPendingFollowUp(null);
            setConvState({ index: limit, current: null, done: true });
            setConvAnswer("");
            return;
        }
        if (limit === 0) {
            setPendingFollowUp(null);
            setConvState({ index: 0, current: null, done: false });
            return;
        }
        const index = Math.min(Math.max(Number(round.conversationalIndex) || 0, 0), limit - 1);
        const item = round.questions?.[index];
        const pending = pendingFollowUpFor(item);
        setPendingFollowUp(pending ? { ...pending, qIndex: index } : null);
        setConvState({ index, current: item?.question || null, done: false });
    }, []);

    const refreshInterviewAndRound = useCallback(async () => {
        const { data } = await api.get(`/interviews/${interviewId}`);
        setInterview(data);
        const index = data.rounds?.findIndex((entry) => entry.round?._id === selectedRound?._id) ?? -1;
        const updated = index >= 0 ? data.rounds[index]?.round : null;
        if (updated) {
            selectRound(updated);
            syncConvStateFromRound(updated);
        }
        return { updated, interview: data, index };
    }, [interviewId, selectedRound?._id, selectRound, setInterview, syncConvStateFromRound]);

    useEffect(() => {
        if (!selectedRound || !isConversational) return;
        syncConvStateFromRound(selectedRound);
    }, [selectedRound, isConversational, syncConvStateFromRound]);

    useEffect(() => {
        if (!selectedRound || !isConversational || convState.done) return;
        const key = storageKeys.conv(interviewId, selectedRound._id, convState.index);
        const saved = storage.get(key);
        if (typeof saved === "string" && saved !== convAnswer) setConvAnswer(saved);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [interviewId, selectedRound?._id, isConversational, convState.index, pendingFollowUp?.number]);

    useEffect(() => {
        if (!selectedRound || !isConversational || convState.done || !convState.current) return;
        const trimmed = (convAnswer || "").trim();
        if (!trimmed) return;
        storage.set(storageKeys.conv(interviewId, selectedRound._id, convState.index), convAnswer);
        setConvSavedAt(Date.now());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [convAnswer]);

    const convViewState = useMemo(() => {
        if (!selectedRound) return convState;
        return { ...convState, done: selectedRound.status === "completed" || convState.done };
    }, [convState, selectedRound]);

    const settleFeedbackJob = useCallback((jobId, onProgress) => {
        if (!jobId) return Promise.resolve("skipped");
        return pollJobStatus("bulk-feedback", jobId, onProgress || (() => {}), 60000)
            .catch((error) => {
                console.debug("background feedback pending", error?.message || error);
                return "timeout";
            });
    }, []);

    const waitForFinalFeedback = useCallback(async (data) => {
        if (!data?.done || !data?.feedbackJobId) {
            if (data?.feedbackJobId) void settleFeedbackJob(data.feedbackJobId);
            return "skipped";
        }
        setConvRoundSubmitting(true);
        setConvFeedbackProgress(8);
        const result = await settleFeedbackJob(data.feedbackJobId, setConvFeedbackProgress);
        if (result !== "completed") {
            showToast("warning", "Round saved. Feedback is still being prepared and will refresh on the overall feedback page.", true);
        }
        return result;
    }, [settleFeedbackJob, showToast]);

    const handleSubmitAnswer = useCallback(async (answer) => {
        if (!selectedRound || !isConversational || pendingFollowUp) return;
        const currentIndex = convState.index;
        if (currentIndex === 0) trackEvent("first_answer_submitted");
        setConvSubmitting(true);
        try {
            storage.remove(storageKeys.conv(interviewId, selectedRound._id, currentIndex));
            const { data } = await api.post(`/questions/${selectedRound._id}/answer`, { index: currentIndex, answer });
            setConvAnswer("");
            if (data?.followUp) setPendingFollowUp({ question: data.followUp, number: data.followUpNumber || 1, qIndex: currentIndex });
            const feedbackResult = await waitForFinalFeedback(data);
            const snapshot = await refreshInterviewAndRound();
            if (data?.done) {
                trackEvent("round_completed");
                if (snapshot.updated) selectRound(snapshot.updated);
                clearDraftsForRound(selectedRound);
                if (feedbackResult !== "timeout") showToast("success", completedRoundMessage(feedbackResult));
            }
        } catch (error) {
            console.error("answer submit error", error);
            showToast("error", describeError(error, "Failed to save your answer."));
        } finally {
            setConvSubmitting(false);
            setConvRoundSubmitting(false);
            setConvFeedbackProgress(0);
        }
    }, [selectedRound, isConversational, pendingFollowUp, convState.index, interviewId, waitForFinalFeedback, refreshInterviewAndRound, showToast, selectRound, clearDraftsForRound]);

    const handleFollowUpDone = useCallback(async (followUpAnswer = "") => {
        if (!pendingFollowUp || !selectedRound) return;
        const answer = (followUpAnswer || "").toString().trim();
        setConvSubmitting(true);
        try {
            storage.remove(storageKeys.conv(interviewId, selectedRound._id, pendingFollowUp.qIndex));
            const { data } = await api.post(`/questions/${selectedRound._id}/follow-up-answer`, {
                index: pendingFollowUp.qIndex,
                answer,
                skip: !answer,
            });
            setConvAnswer("");
            if (data?.followUp) setPendingFollowUp({ question: data.followUp, number: data.followUpNumber || pendingFollowUp.number + 1, qIndex: pendingFollowUp.qIndex });
            else setPendingFollowUp(null);
            const feedbackResult = await waitForFinalFeedback(data);
            const snapshot = await refreshInterviewAndRound();
            if (data?.done) {
                trackEvent("round_completed");
                if (snapshot.updated) selectRound(snapshot.updated);
                clearDraftsForRound(selectedRound);
                if (feedbackResult !== "timeout") showToast("success", completedRoundMessage(feedbackResult));
            }
        } catch (error) {
            console.error("follow-up submit error", error);
            showToast("warning", describeError(error, "Follow-up answer could not be saved."));
        } finally {
            setConvSubmitting(false);
            setConvRoundSubmitting(false);
            setConvFeedbackProgress(0);
        }
    }, [pendingFollowUp, selectedRound, interviewId, waitForFinalFeedback, refreshInterviewAndRound, showToast, selectRound, clearDraftsForRound]);

    const handleClarify = useCallback(async (message) => {
        if (!selectedRound || !isConversational) return "";
        try {
            const { data } = await api.post(`/questions/${selectedRound._id}/clarify`, { message });
            return (data?.answer || "").toString();
        } catch (error) {
            console.error("clarify error", error);
            const errorMessage = describeError(error, "Failed to clarify.");
            showToast("error", errorMessage);
            return "";
        }
    }, [selectedRound, isConversational, showToast]);

    const handleCompleteRound = useCallback(async () => {
        if (!selectedRound) return;
        try {
            setConvRoundSubmitting(true);
            setConvFeedbackProgress(8);
            let latest;
            try {
                const { data } = await api.get(`/interviews/${interviewId}`);
                latest = data;
                setInterview(data);
            } catch { /* continue with local round */ }
            const roundForFeedback = latest?.rounds?.find((entry) => entry.round?._id === selectedRound._id)?.round || selectedRound;
            let feedbackJobId = null;
            try {
                const answered = (roundForFeedback.questions || [])
                    .map((item, index) => ({ index, questionId: item.question?._id, answer: composeFeedbackAnswer(item) }))
                    .filter((item) => item.questionId && item.answer);
                if (answered.length > 0) {
                    const { data: job } = await api.post(`/jobs/bulk-feedback`, { roundId: selectedRound._id, items: answered, attach: true });
                    if (job?.jobId) feedbackJobId = job.jobId;
                }
            } catch (error) {
                console.debug("conversational feedback deferred", error?.message || error);
            }
            await api.post(`/questions/${selectedRound._id}/complete`);
            let feedbackResult = "skipped";
            if (feedbackJobId) {
                feedbackResult = await settleFeedbackJob(feedbackJobId, setConvFeedbackProgress);
                if (feedbackResult !== "completed") {
                    showToast("warning", "Round saved. Feedback is still being prepared and will refresh on the overall feedback page.", true);
                }
            }
            const { data } = await api.get(`/interviews/${interviewId}`);
            setInterview(data);
            clearDraftsForRound(selectedRound);
            const index = (data.rounds || []).findIndex((entry) => entry.round._id === selectedRound._id);
            const updatedSelf = index >= 0 ? data.rounds[index]?.round : null;
            selectRound(updatedSelf || null);
            if (feedbackResult !== "timeout") showToast("success", completedRoundMessage(feedbackResult));
        } catch (error) {
            console.error("complete round error", error);
            showToast("error", describeError(error, "Failed to complete round."));
        } finally {
            setConvRoundSubmitting(false);
            setConvFeedbackProgress(0);
        }
    }, [selectedRound, interviewId, clearDraftsForRound, selectRound, setInterview, showToast, settleFeedbackJob]);

    return {
        convState, convViewState,
        convAnswer, setConvAnswer,
        convSavedAt,
        convSubmitting, convRoundSubmitting, convFeedbackProgress,
        syncConvStateFromRound,
        pendingFollowUp,
        handleSubmitAnswer, handleFollowUpDone, handleClarify, handleCompleteRound,
    };
};
