import { useState, useCallback, useEffect, useRef } from "react";
import api from "../api/axios";
import { storage, storageKeys } from "../utils/interviewStorage";
import { pollJobStatus } from "../utils/pollJobStatus";
import { trackEvent } from "../utils/analytics";

/**
 * Manages online-assessment mode: answer state, local recovery, debounced server
 * autosave and final submission.
 */
export const useOAForm = ({
    interviewId,
    selectedRound,
    isConversational,
    roundLocked,
    selectRound,
    setInterview,
    showToast,
    clearDraftsForRound,
}) => {
    const [oaAnswers, setOaAnswers] = useState([]);
    const [oaSubmitting, setOaSubmitting] = useState(false);
    const [oaFeedbackProgress, setOaFeedbackProgress] = useState(0);
    const autosaveTimerRef = useRef(null);
    const lastServerSnapshotRef = useRef("");

    useEffect(() => {
        if (!selectedRound || isConversational) return;
        const questionCount = selectedRound.questions?.length || 0;
        const key = storageKeys.oa(interviewId, selectedRound._id);
        const saved = storage.get(key);
        const len = Math.max(questionCount, Array.isArray(saved) ? saved.length : 0);
        setOaAnswers((prev) => {
            const next = new Array(len).fill("");
            for (let i = 0; i < len; i++) next[i] = (saved?.[i] ?? prev?.[i] ?? "").toString();
            return next;
        });
        lastServerSnapshotRef.current = JSON.stringify((selectedRound.questions || []).map((question) => (question?.answerGiven || "").toString()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [interviewId, selectedRound?._id, selectedRound?.questions?.length, isConversational]);

    useEffect(() => {
        if (!selectedRound || isConversational) return;
        const normalized = (oaAnswers || []).map((answer) => (answer || "").toString());
        const hasContent = normalized.some((answer) => answer.trim().length > 0);
        if (hasContent) storage.set(storageKeys.oa(interviewId, selectedRound._id), normalized);

        const roundId = String(selectedRound._id);
        setInterview((current) => {
            if (!current) return current;
            let changed = false;
            const rounds = (current.rounds || []).map((entry) => {
                if (String(entry?.round?._id || "") !== roundId) return entry;
                let roundChanged = false;
                const questions = (entry.round.questions || []).map((question, index) => {
                    const nextAnswer = normalized[index] || "";
                    if ((question?.answerGiven || "").toString() === nextAnswer) return question;
                    changed = true;
                    roundChanged = true;
                    return { ...question, answerGiven: nextAnswer };
                });
                return roundChanged ? { ...entry, round: { ...entry.round, questions } } : entry;
            });
            return changed ? { ...current, rounds } : current;
        });
    }, [interviewId, isConversational, oaAnswers, selectedRound?._id, setInterview]);

    useEffect(() => {
        clearTimeout(autosaveTimerRef.current);
        if (!selectedRound || isConversational || selectedRound.status === "completed" || oaSubmitting) return undefined;
        const questionCount = selectedRound.questions?.length || 0;
        if (!questionCount) return undefined;
        const snapshot = Array.from({ length: questionCount }, (_, index) => (oaAnswers?.[index] || "").toString());
        const serialized = JSON.stringify(snapshot);
        if (serialized === lastServerSnapshotRef.current) return undefined;
        autosaveTimerRef.current = window.setTimeout(async () => {
            try {
                await api.post(`/questions/${selectedRound._id}/answers`, { answers: snapshot });
                lastServerSnapshotRef.current = serialized;
            } catch (error) {
                console.debug("OA autosave deferred", error?.message || error);
            }
        }, 850);
        return () => clearTimeout(autosaveTimerRef.current);
    }, [isConversational, oaAnswers, oaSubmitting, selectedRound]);

    useEffect(() => () => clearTimeout(autosaveTimerRef.current), []);

    const handleOAChange = useCallback((i, val) => {
        setOaAnswers((prev) => {
            const next = [...prev];
            next[i] = val;
            return next;
        });
    }, []);

    const handleOASubmit = useCallback(async (answersOverride) => {
        if (!selectedRound || isConversational) return;
        if (roundLocked) {
            showToast("warning", "Complete the previous round first.");
            return;
        }
        if (!(Array.isArray(selectedRound.questions) && selectedRound.questions.length > 0)) {
            showToast("warning", "No questions yet. Please wait or reselect the round.");
            return;
        }
        const answersToSubmit = Array.isArray(answersOverride) ? answersOverride : oaAnswers;
        if (!(answersToSubmit || []).some((a) => (a || "").toString().trim().length > 0)) {
            showToast("warning", "Please provide at least one answer before submitting.");
            return;
        }
        try {
            clearTimeout(autosaveTimerRef.current);
            setOaSubmitting(true);
            setOaFeedbackProgress(8);
            trackEvent("first_answer_submitted");
            const outgoing = Array.from({ length: selectedRound.questions.length }, (_, i) => (answersToSubmit?.[i] ?? "").toString());
            await api.post(`/questions/${selectedRound._id}/answers`, { answers: outgoing });
            lastServerSnapshotRef.current = JSON.stringify(outgoing);

            let feedbackJobId = null;
            try {
                const answered = (selectedRound.questions || [])
                    .map((q, i) => ({ index: i, questionId: q.question?._id, answer: (outgoing[i] || "").toString().trim() }))
                    .filter((it) => it.questionId && it.answer.length > 0);
                if (answered.length > 0) {
                    const { data: job } = await api.post(`/jobs/bulk-feedback`, { roundId: selectedRound._id, items: answered, attach: true });
                    if (job?.jobId) feedbackJobId = job.jobId;
                }
            } catch (e) {
                console.error("bulk feedback enqueue error", e);
            }

            await api.post(`/questions/${selectedRound._id}/complete`);
            if (feedbackJobId) {
                const result = await pollJobStatus("bulk-feedback", feedbackJobId, setOaFeedbackProgress, 60000).catch(() => "timeout");
                if (result !== "completed") {
                    showToast("warning", "Round saved. Feedback is still being prepared; reopen this round in a moment if it is not visible yet.", true);
                }
            }
            const { data } = await api.get(`/interviews/${interviewId}`);
            setInterview(data);
            const index = data.rounds.findIndex((r) => r.round._id === selectedRound._id);
            const updated = index >= 0 ? data.rounds[index]?.round : null;
            selectRound(updated || null);
            clearDraftsForRound(selectedRound);
            showToast("success", "Round complete. Review your debrief, then use Rounds when you’re ready to continue.");
            trackEvent("round_completed");
        } catch (e) {
            console.error("OA submit error", e);
            showToast("error", e?.response?.data?.message || "Failed to submit round.");
        } finally {
            setOaSubmitting(false);
            setOaFeedbackProgress(0);
        }
    }, [selectedRound, isConversational, roundLocked, oaAnswers, interviewId, selectRound, setInterview, showToast, clearDraftsForRound]);

    return { oaAnswers, setOaAnswers, oaSubmitting, oaFeedbackProgress, handleOAChange, handleOASubmit };
};
