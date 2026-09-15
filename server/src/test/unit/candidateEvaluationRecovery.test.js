import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    find: vi.fn(),
    updateOne: vi.fn(),
    getQueue: vi.fn(),
}));

vi.mock("../../models/CandidateAttempt.js", () => ({ default: { find: mocks.find, updateOne: mocks.updateOne } }));
vi.mock("../../queues/index.js", () => ({ getQueue: mocks.getQueue }));

import { recoverCandidateEvaluations } from "../../services/candidateEvaluationRecovery.js";

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

    it("bumps evaluationStartedAt before re-enqueuing, so a job id that already reached a terminal state in Redis doesn't silently swallow the recovery attempt", async () => {
        const staleStartedAt = new Date("2020-01-01T00:00:00Z");
        mocks.find.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([{ _id: "attempt-1", evaluationStartedAt: staleStartedAt }]) }) });
        const add = vi.fn().mockResolvedValue({ id: "job-1" });
        mocks.getQueue.mockResolvedValue({ add });

        const recovered = await recoverCandidateEvaluations({ olderThanMs: 60_000 });

        expect(recovered).toBe(1);
        expect(mocks.updateOne).toHaveBeenCalledWith(
            { _id: "attempt-1", status: "evaluating" },
            { $set: { evaluationStartedAt: expect.any(Date) } },
        );
        const bumpedStartedAt = mocks.updateOne.mock.calls[0][1].$set.evaluationStartedAt;
        expect(bumpedStartedAt.getTime()).not.toBe(staleStartedAt.getTime());

        expect(add).toHaveBeenCalledOnce();
        const [, , jobOptions] = add.mock.calls[0];
        // The job id is derived from evaluationStartedAt — it must reflect the freshly
        // bumped timestamp, not the original stale one, or this recovery attempt would
        // collide with a job id that may already be dead in Redis.
        expect(jobOptions.jobId).not.toContain(staleStartedAt.toISOString());
    });

    it("no-ops when there are no stranded attempts", async () => {
        mocks.find.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) });
        const recovered = await recoverCandidateEvaluations();
        expect(recovered).toBe(0);
        expect(mocks.getQueue).not.toHaveBeenCalled();
    });
});
