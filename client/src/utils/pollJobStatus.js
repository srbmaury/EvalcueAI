import api from "../api/axios";

/**
 * Poll a BullMQ job until it completes, fails, or times out.
 * @param {"prepare-questions"|"bulk-feedback"} jobType
 * @param {string} jobId
 * @param {(pct: number) => void} [onProgress]
 * @param {number} [timeoutMs]
 */
export const pollJobStatus = async (jobType, jobId, onProgress, timeoutMs = 60000) => {
    const start = Date.now();
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const timedOut = () => Date.now() - start > timeoutMs;
    const poll = async () => {
        try {
            const { data } = await api.get(`/jobs/status/${jobType}/${jobId}`);
            if (onProgress) onProgress(Math.max(0, Math.min(100, Number(data?.progress) || 0)));
            const state = data?.state;
            if (state === "completed" || state === "failed") return state;
            if (timedOut()) return "timeout";
            await sleep(700);
            return poll();
        } catch {
            if (timedOut()) return "timeout";
            await sleep(1000);
            return poll();
        }
    };
    return poll();
};
