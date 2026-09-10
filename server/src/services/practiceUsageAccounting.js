import PracticeUsageCounter from "../models/PracticeUsageCounter.js";
import ResumeReview from "../models/ResumeReview.js";

const periodBounds = (period) => {
    if (!/^\d{4}-\d{2}$/.test(period || "")) throw new Error("Invalid practice usage period");
    const [year, month] = period.split("-").map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    return { start, end };
};

const observedUsage = async ({ userId, metric, period }) => {
    if (metric !== "resumeReviews") return null;
    const { start, end } = periodBounds(period);
    return ResumeReview.countDocuments({
        user: userId,
        createdAt: { $gte: start, $lt: end },
    });
};

export const reconcilePracticeUsageCounter = async ({ userId, metric, period }) => {
    const observed = await observedUsage({ userId, metric, period });
    if (observed === null || observed <= 0) return null;

    const filter = { user: userId, metric, period };
    try {
        return await PracticeUsageCounter.findOneAndUpdate(
            filter,
            { $max: { used: observed } },
            { new: true, upsert: true, setDefaultsOnInsert: true },
        );
    } catch (error) {
        if (error?.code !== 11000) throw error;
        return PracticeUsageCounter.findOneAndUpdate(
            filter,
            { $max: { used: observed } },
            { new: true },
        );
    }
};
