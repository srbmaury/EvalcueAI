import { useState, useCallback, useEffect, useMemo } from "react";
import api from "../api/axios";
import { storage, storageKeys } from "../utils/interviewStorage";
import { pollJobStatus } from "../utils/pollJobStatus";
import { describeError } from "../utils/errorFormatter";

/**
 * Owns the interview document, round selection, question preparation, and skip.
 */
export const useInterviewSession = (interviewId, showToast) => {
    const [interview, setInterview] = useState(null);
    const [selectedRound, setSelectedRound] = useState(null);
    const [roundLocked, setRoundLocked] = useState(false);
    const [loadingRound, setLoadingRound] = useState(false);
    const [roundPrepareProgress, setRoundPrepareProgress] = useState(0);
    const [prepError, setPrepError] = useState(null);
    const [prepRetryKey, setPrepRetryKey] = useState(0);

    const allRoundsCompleted = useMemo(
        () => Array.isArray(interview?.rounds) && interview.rounds.length > 0
            ? interview.rounds.every((r) => r?.round?.status === "completed")
            : false,
        [interview]
    );

    const selectRound = useCallback((roundOrNull) => {
        setSelectedRound(roundOrNull);
        if (roundOrNull?._id) {
            storage.set(storageKeys.selRound(interviewId), roundOrNull._id);
        }
    }, [interviewId]);

    const clearDraftsForRound = useCallback((round) => {
        if (!round) return;
        try {
            storage.remove(storageKeys.oa(interviewId, round._id));
            storage.remove(storageKeys.oaVoice(interviewId, round._id));
            storage.remove(storageKeys.oaCoding(interviewId, round._id));
            const limit = Number(round?.questionLimit) || (round?.questions?.length || 20);
            for (let i = 0; i < limit; i++) {
                storage.remove(storageKeys.conv(interviewId, round._id, i));
                storage.remove(storageKeys.convVoice(interviewId, round._id, i));
                storage.remove(storageKeys.convCoding(interviewId, round._id, i));
                storage.remove(storageKeys.codeEditor(`${interviewId}:${round._id}:${i}`));
            }
        } catch { void 0; }
    }, [interviewId]);

    // Initial load
    useEffect(() => {
        const fetchInterview = async () => {
            try {
                const { data } = await api.get(`/interviews/${interviewId}`);
                setInterview(data);
                if (data.rounds.length > 0) {
                    const persisted = storage.get(storageKeys.selRound(interviewId));
                    const found = data.rounds.find((r) => r.round?._id === persisted)?.round;
                    selectRound(found || data.rounds[0].round);
                }
            } catch (err) {
                console.error(err);
            }
        };
        fetchInterview();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [interviewId]);

    const handleSkipRound = useCallback(async () => {
        try {
            await api.delete(`/questions/${interviewId}/rounds/${selectedRound._id}`);
            const { data } = await api.get(`/interviews/${interviewId}`);
            setInterview(data);
            clearDraftsForRound(selectedRound);
            selectRound(data.rounds[0]?.round || null);
            showToast("success", "Round skipped.");
        } catch (e) {
            console.error("skip error", e);
            showToast("error", describeError(e, "Failed to skip round."));
        }
    }, [interviewId, selectedRound, selectRound, showToast, clearDraftsForRound]);

    const prepareNextRound = useCallback((round) => {
        if (!round?.nextRound) return;
        try {
            const nextEntry = (interview?.rounds || []).find(
                (r) => String(r?.round?._id) === String(round.nextRound)
            );
            const next = nextEntry?.round;
            if (!next || (Array.isArray(next.questions) && next.questions.length > 0)) return;
            const count = Math.min(
                Math.max(Number(next?.questionLimit) || (next?.deliveryMode === "online-assessment" ? 12 : 8), 1),
                20
            );
            api.post(`/questions/${interviewId}/rounds/${round.nextRound}/prepare`, { count, prefetch: true })
                .catch((e) => console.warn("prefetch next round failed", e));
        } catch (e) {
            console.warn("prepareNextRound error", e);
        }
    }, [interview?.rounds, interviewId]);

    // Question preparation
    useEffect(() => {
        if (!selectedRound) return;
        let cancelled = false;

        const prepare = async () => {
            setPrepError(null);

            if (selectedRound.status === "completed") {
                setLoadingRound(false);
                return;
            }
            if (selectedRound.questions?.length > 0) return;

            const order = interview?.rounds || [];
            const idx = order.findIndex((r) => r.round._id === selectedRound._id);
            const prevIncomplete = order.slice(0, idx).some((r) => r.round.status !== "completed");
            setRoundLocked(prevIncomplete);
            if (prevIncomplete) return;

            try {
                const isConv = selectedRound?.deliveryMode === "conversational";
                const desiredCount = Number(selectedRound?.questionLimit) || (isConv ? 8 : 12);
                setLoadingRound(true);
                setRoundPrepareProgress(0);

                const { data: job } = await api.post(`/jobs/prepare-questions`, {
                    interviewId,
                    roundId: selectedRound._id,
                    count: desiredCount,
                    prefetch: false,
                });
                if (job?.jobId) {
                    await pollJobStatus("prepare-questions", job.jobId, (p) => {
                        if (!cancelled) setRoundPrepareProgress(p);
                    });
                }

                if (cancelled) return;
                const { data } = await api.get(`/interviews/${interviewId}`);
                setInterview(data);
                const updated = data.rounds.find((r) => r.round._id === selectedRound._id)?.round;
                if (updated) selectRound(updated);
                prepareNextRound(selectedRound);
            } catch (e) {
                if (cancelled) return;
                console.error("prepare round failed", e);
                const msg = describeError(e, "Failed to prepare questions.");
                setPrepError(msg);
                showToast("error", msg);
            } finally {
                if (!cancelled) {
                    setLoadingRound(false);
                    setRoundPrepareProgress(0);
                }
            }
        };

        prepare();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedRound?._id, prepRetryKey]);

    return {
        interview, setInterview,
        selectedRound, setSelectedRound, selectRound,
        roundLocked, setRoundLocked,
        loadingRound, roundPrepareProgress,
        prepError, retryPrep: () => setPrepRetryKey((k) => k + 1),
        allRoundsCompleted,
        clearDraftsForRound, handleSkipRound,
    };
};
