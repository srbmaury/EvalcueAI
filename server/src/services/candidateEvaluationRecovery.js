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
    let recovered = 0;
    for (const attempt of strandedAttempts) {
        const options = candidateEvaluationJobOptions(attempt);
        const job = await assessmentQueue.getJob(options.jobId);
        if (!job) {
            await assessmentQueue.add("evaluate", { attemptId: String(attempt._id), evaluationStartedAt: attempt.evaluationStartedAt.toISOString() }, options);
            recovered += 1;
        } else if (await job.getState() === "failed") {
            await CandidateAttempt.updateOne(
                { _id: attempt._id, status: "evaluating", evaluationStartedAt: attempt.evaluationStartedAt },
                { $set: { status: "evaluation_failed", evaluationError: "Evaluation failed. Please retry." } },
            );
        }
    }
    return recovered;
};
