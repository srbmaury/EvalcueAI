import CandidateAttempt from "../models/CandidateAttempt.js";
import { getQueue } from "../queues/index.js";
import { createJobId } from "../queues/jobIds.js";

export const candidateEvaluationJobOptions = (attempt) => ({
    jobId: createJobId("candidate-assessment", { attemptId: String(attempt._id), evaluationStartedAt: attempt.evaluationStartedAt.toISOString() }),
    removeOnComplete: { age: 86400, count: 1000 },
    removeOnFail: { age: 604800, count: 1000 },
});

// Recovers attempts stranded at status "evaluating" (e.g. a worker process crashed
// mid-job, bypassing the normal success/failure status update).
export const recoverCandidateEvaluations = async ({ olderThanMs = 0 } = {}) => {
    if (!process.env.REDIS_URL) return 0;
    const evaluationFilter = { status: "evaluating", evaluationStartedAt: { $ne: null } };
    if (olderThanMs > 0) evaluationFilter.evaluationStartedAt.$lte = new Date(Date.now() - olderThanMs);
    const strandedAttempts = await CandidateAttempt.find(evaluationFilter).select("evaluationStartedAt").lean();
    if (!strandedAttempts.length) return 0;
    const assessmentQueue = await getQueue("candidate-assessment");
    if (!assessmentQueue) return 0;
    for (const attempt of strandedAttempts) {
        // The job id is a deterministic hash of (attemptId, evaluationStartedAt). If a
        // prior recovery attempt's job already reached a terminal state in Redis (e.g.
        // failed, kept for up to 7 days via removeOnFail), re-adding with the SAME id
        // just returns that dead job's id without re-queuing anything — this recovery
        // loop would otherwise silently no-op forever. Bump evaluationStartedAt first so
        // every recovery attempt gets a fresh job identity that BullMQ will actually run.
        const now = new Date();
        await CandidateAttempt.updateOne({ _id: attempt._id, status: "evaluating" }, { $set: { evaluationStartedAt: now } });
        await assessmentQueue.add("evaluate", { attemptId: String(attempt._id) }, candidateEvaluationJobOptions({ _id: attempt._id, evaluationStartedAt: now }));
    }
    return strandedAttempts.length;
};
