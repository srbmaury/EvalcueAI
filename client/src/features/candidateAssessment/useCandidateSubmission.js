import { useEffect } from "react";
import api from "../../api/axios";
import { describeError } from "../../utils/errorFormatter";

const statusPath = (shareToken, attemptId) => `/assessments/public/${shareToken}/attempts/${attemptId}/evaluation-status`;
const submissionKey = (storageKey) => `${storageKey}:submission`;
const recoverableStatuses = ["evaluating", "evaluation_failed", "submitted", "revoked"];

export const readSavedAttempt = (key) => {
    try { return JSON.parse(window.sessionStorage?.getItem(key) || "null"); } catch { return null; }
};
export const writeSavedAttempt = (key, value) => {
    try { window.sessionStorage?.setItem(key, JSON.stringify(value)); } catch { /* local recovery is best effort */ }
};
export const removeSavedAttempt = (key) => {
    try { window.sessionStorage?.removeItem(key); } catch { /* local recovery is best effort */ }
};

const fetchEvaluationStatus = async (endpoint, attemptToken, signal) => {
    const { data } = await api.get(endpoint, {
        headers: { "X-Attempt-Token": attemptToken },
        skipAuthRedirect: true,
        signal,
    });
    return data.status;
};

export const recoverCandidateSubmission = async ({ saved, storageKey, shareToken, signal }) => {
    if (!saved?.attempt?._id || !saved.attemptToken) return null;
    const pending = readSavedAttempt(submissionKey(storageKey)) === saved.attempt._id;
    const status = saved.attempt.status;
    if (!pending && !recoverableStatuses.includes(status) && status !== "submission_pending") return null;

    try {
        const latest = await fetchEvaluationStatus(statusPath(shareToken, saved.attempt._id), saved.attemptToken, signal);
        if (recoverableStatuses.includes(latest)) return { ...saved.attempt, status: latest };
        if (latest === "started") {
            removeSavedAttempt(submissionKey(storageKey));
            return null;
        }
    } catch {
        // Keep the receipt recoverable if the server is temporarily unavailable.
    }
    return { ...saved.attempt, status: recoverableStatuses.includes(status) ? status : "submission_pending" };
};

export const clearSubmissionIntent = (storageKey) => removeSavedAttempt(submissionKey(storageKey));

export function useCandidateSubmission({
    shareToken, storageKey, attempt, attemptToken, saveAttemptToSession, setAttempt, notify,
}) {
    const status = attempt?.status;
    const attemptId = attempt?._id;
    useEffect(() => {
        if (!["evaluating", "submission_pending"].includes(status) || !attemptId || !attemptToken) return undefined;
        const controller = new AbortController();
        let timer;
        const pollEvaluationStatus = async () => {
            try {
                const latest = await fetchEvaluationStatus(statusPath(shareToken, attemptId), attemptToken, controller.signal);
                if (controller.signal.aborted) return;
                if (latest !== status && recoverableStatuses.includes(latest)) {
                    setAttempt((current) => current?._id === attemptId ? { ...current, status: latest } : current);
                    return;
                }
                if (latest === "started" && status === "submission_pending") return;
            } catch {
                // Retry transient request failures without losing the local receipt.
            }
            if (!controller.signal.aborted) timer = window.setTimeout(pollEvaluationStatus, 10_000);
        };
        timer = window.setTimeout(pollEvaluationStatus, 10_000);
        return () => {
            controller.abort();
            window.clearTimeout(timer);
        };
    }, [attemptId, attemptToken, setAttempt, shareToken, status]);

    const submitAttempt = async () => {
        writeSavedAttempt(submissionKey(storageKey), attemptId);
        try {
            const { data } = await api.post(`/assessments/public/${shareToken}/attempts/${attemptId}/submit`, {}, {
                headers: { "X-Attempt-Token": attemptToken },
                skipAuthRedirect: true,
            });
            if (data.status !== "submitted" && data.status !== "evaluating") throw new Error("Unexpected submission status");
            saveAttemptToSession({ ...attempt, status: data.status });
            return true;
        } catch (error) {
            const responseStatus = error.response?.status;
            if (!responseStatus || responseStatus >= 500) {
                const recovered = await recoverCandidateSubmission({ saved: { attempt, attemptToken }, storageKey, shareToken });
                if (recovered) {
                    saveAttemptToSession(recovered);
                    return true;
                }
            }
            notify(describeError(error, "Your assessment could not be submitted."), "error");
            return false;
        }
    };

    return submitAttempt;
}
