import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    find: vi.fn(),
    lean: vi.fn(),
    resumeCount: vi.fn(),
    interviewCount: vi.fn(),
    create: vi.fn(),
    updateOne: vi.fn(),
    deleteMany: vi.fn(),
    findOneAndUpdate: vi.fn(),
}));

vi.mock("../../models/ResumeReview.js", () => ({
    default: { countDocuments: mocks.resumeCount },
}));

vi.mock("../../models/Interview.js", () => ({
    default: { countDocuments: mocks.interviewCount },
}));

vi.mock("../../models/PracticeUsageCounter.js", () => ({
    default: {
        find: mocks.find,
        create: mocks.create,
        updateOne: mocks.updateOne,
        deleteMany: mocks.deleteMany,
        findOneAndUpdate: mocks.findOneAndUpdate,
    },
}));

const { reconcilePracticeUsageCounter, reservePracticeUsage } = await import("../../services/practiceUsageAccounting.js");

describe("practice usage accounting", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.find.mockReturnValue({ sort: () => ({ lean: mocks.lean }) });
        mocks.resumeCount.mockResolvedValue(0);
        mocks.interviewCount.mockResolvedValue(0);
        mocks.updateOne.mockResolvedValue({ acknowledged: true });
        mocks.deleteMany.mockResolvedValue({ acknowledged: true });
    });

    it("collapses duplicate counters and preserves total consumed resume-review usage", async () => {
        mocks.lean.mockResolvedValue([
            { _id: "counter-a", used: 3 },
            { _id: "counter-b", used: 2 },
        ]);
        mocks.resumeCount.mockResolvedValue(5);

        const result = await reconcilePracticeUsageCounter({
            userId: "user-1",
            metric: "resumeReviews",
            period: "2026-09",
        });

        expect(mocks.resumeCount).toHaveBeenCalledWith({
            user: "user-1",
            createdAt: {
                $gte: new Date("2026-09-01T00:00:00.000Z"),
                $lt: new Date("2026-10-01T00:00:00.000Z"),
            },
        });
        expect(mocks.updateOne).toHaveBeenCalledWith(
            { _id: "counter-a" },
            { $set: { used: 5 } },
        );
        expect(mocks.deleteMany).toHaveBeenCalledWith({ _id: { $in: ["counter-b"] } });
        expect(result).toEqual({ used: 5, counterId: "counter-a" });
    });

    it("reconciles interview usage from persisted interviews", async () => {
        mocks.lean.mockResolvedValue([]);
        mocks.interviewCount.mockResolvedValue(4);
        mocks.create.mockResolvedValue({ _id: "counter-i", used: 4 });

        const result = await reconcilePracticeUsageCounter({
            userId: "user-1",
            metric: "interviews",
            period: "2026-09",
        });

        expect(mocks.interviewCount).toHaveBeenCalledTimes(1);
        expect(mocks.create).toHaveBeenCalledWith({
            user: "user-1",
            metric: "interviews",
            period: "2026-09",
            used: 4,
        });
        expect(result).toEqual({ used: 4, counterId: "counter-i" });
    });

    it("does not create another counter after the monthly limit is reached", async () => {
        mocks.lean.mockResolvedValue([{ _id: "counter-3", used: 3 }]);
        mocks.interviewCount.mockResolvedValue(3);

        const result = await reservePracticeUsage({
            userId: "user-1",
            metric: "interviews",
            period: "2026-09",
            limit: 3,
        });

        expect(result).toEqual({ allowed: false, used: 3, counterId: "counter-3" });
        expect(mocks.create).not.toHaveBeenCalled();
        expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("increments the canonical counter up to the limit", async () => {
        mocks.lean.mockResolvedValue([{ _id: "counter-2", used: 2 }]);
        mocks.resumeCount.mockResolvedValue(2);
        mocks.findOneAndUpdate.mockResolvedValue({ _id: "counter-2", used: 3 });

        const result = await reservePracticeUsage({
            userId: "user-1",
            metric: "resumeReviews",
            period: "2026-09",
            limit: 3,
        });

        expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
            { _id: "counter-2", used: { $lt: 3 } },
            { $inc: { used: 1 } },
            { new: true },
        );
        expect(result).toEqual({ allowed: true, used: 3, counterId: "counter-2" });
    });
});
