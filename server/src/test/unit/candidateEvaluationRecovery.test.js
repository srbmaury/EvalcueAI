import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    find: vi.fn(),
    updateOne: vi.fn(),
    getQueue: vi.fn(),
}));

vi.mock("../../models/CandidateAttempt.js", () => ({ default: { find: mocks.find, updateOne: mocks.updateOne } }));
vi.mock("../../queues/index.js", () => ({ getQueue: mocks.getQueue }));

import { candidateEvaluationJobOptions, recoverCandidateEvaluations } from "../../services/candidateEvaluationRecovery.js";

describe("recoverCandidateEvaluations", () => {
    const previousRedisUrl = process.env.REDIS_URL;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.REDIS_URL = "redis://localhost:6379";
        mocks.updateOne.mockResolvedValue({ modifiedCount: 1 });
    });

    afterEach(() => {
        if (previousRedisUrl === undefined) delete process.env.REDIS_URL;
        else process.env.REDIS_URL = previousRedisUrl;
    });

    it("does nothing when Redis isn't configured", async () => {
        delete process.env.REDIS_URL;
        const recovered = await recoverCandidateEvaluations();
        expect(recovered).toBe(0);
        expect(mocks.find).not.toHaveBeenCalled();
    });

    it("recreates a missing job under its original ID and skips active jobs", async () => {
        const attempt = { _id: "attempt-1", evaluationStartedAt: new Date("2020-01-01T00:00:00Z") };
        mocks.find.mockReturnValue({ select: () => ({ lean: async () => [attempt] }) });
        const add = vi.fn();
        const getJob = vi.fn().mockResolvedValueOnce(null).mockResolvedValue({ getState: async () => "active" });
        mocks.getQueue.mockResolvedValue({ add, getJob });

        expect(await recoverCandidateEvaluations({ olderThanMs: 60_000 })).toBe(1);
        expect(await recoverCandidateEvaluations({ olderThanMs: 60_000 })).toBe(0);
        expect(mocks.updateOne).not.toHaveBeenCalled();
        expect(add).toHaveBeenCalledExactlyOnceWith("evaluate", {
            attemptId: attempt._id,
            evaluationStartedAt: attempt.evaluationStartedAt.toISOString(),
        }, candidateEvaluationJobOptions(attempt));
    });

    it("no-ops when there are no stranded attempts", async () => {
        mocks.find.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) });
        const recovered = await recoverCandidateEvaluations();
        expect(recovered).toBe(0);
        expect(mocks.getQueue).not.toHaveBeenCalled();
    });
});
