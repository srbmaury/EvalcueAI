import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    countDocuments: vi.fn(),
    findOneAndUpdate: vi.fn(),
}));

vi.mock("../../models/ResumeReview.js", () => ({
    default: { countDocuments: mocks.countDocuments },
}));

vi.mock("../../models/PracticeUsageCounter.js", () => ({
    default: { findOneAndUpdate: mocks.findOneAndUpdate },
}));

const { reconcilePracticeUsageCounter } = await import("../../services/practiceUsageAccounting.js");

describe("practice usage accounting", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("uses persisted reviews as a floor for resume-review usage", async () => {
        mocks.countDocuments.mockResolvedValue(5);
        mocks.findOneAndUpdate.mockResolvedValue({ used: 5 });

        const result = await reconcilePracticeUsageCounter({
            userId: "user-1",
            metric: "resumeReviews",
            period: "2026-09",
        });

        expect(mocks.countDocuments).toHaveBeenCalledWith({
            user: "user-1",
            createdAt: {
                $gte: new Date("2026-09-01T00:00:00.000Z"),
                $lt: new Date("2026-10-01T00:00:00.000Z"),
            },
        });
        expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
            { user: "user-1", metric: "resumeReviews", period: "2026-09" },
            { $max: { used: 5 } },
            { new: true, upsert: true, setDefaultsOnInsert: true },
        );
        expect(result).toEqual({ used: 5 });
    });

    it("does not query persisted records for metrics without a reconciliation source", async () => {
        const result = await reconcilePracticeUsageCounter({
            userId: "user-1",
            metric: "interviews",
            period: "2026-09",
        });

        expect(result).toBeNull();
        expect(mocks.countDocuments).not.toHaveBeenCalled();
        expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("retries without upsert if concurrent reconciliation creates the counter first", async () => {
        mocks.countDocuments.mockResolvedValue(2);
        mocks.findOneAndUpdate
            .mockRejectedValueOnce(Object.assign(new Error("duplicate"), { code: 11000 }))
            .mockResolvedValueOnce({ used: 2 });

        const result = await reconcilePracticeUsageCounter({
            userId: "user-1",
            metric: "resumeReviews",
            period: "2026-09",
        });

        expect(mocks.findOneAndUpdate).toHaveBeenCalledTimes(2);
        expect(mocks.findOneAndUpdate).toHaveBeenLastCalledWith(
            { user: "user-1", metric: "resumeReviews", period: "2026-09" },
            { $max: { used: 2 } },
            { new: true },
        );
        expect(result).toEqual({ used: 2 });
    });
});
