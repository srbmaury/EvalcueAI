import PracticeUsageCounter from "../models/PracticeUsageCounter.js";
import Interview from "../models/Interview.js";
import ResumeReview from "../models/ResumeReview.js";

const usageModels = {
    interviews: Interview,
    resumeReviews: ResumeReview,
};

const periodBounds = (period) => {
    if (!/^\d{4}-\d{2}$/.test(period || "")) throw new Error("Invalid practice usage period");
    const [year, month] = period.split("-").map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    return { start, end };
};

const observedUsage = async ({ userId, metric, period }) => {
    const Model = usageModels[metric];
    if (!Model) return 0;
    const { start, end } = periodBounds(period);
    return Model.countDocuments({
        user: userId,
        createdAt: { $gte: start, $lt: end },
    });
};

export const reconcilePracticeUsageCounter = async ({ userId, metric, period }) => {
    const filter = { user: userId, metric, period };
    const [counters, observed] = await Promise.all([
        PracticeUsageCounter.find(filter).sort({ createdAt: 1, _id: 1 }).lean(),
        observedUsage({ userId, metric, period }),
    ]);

    const recorded = counters.reduce((sum, counter) => sum + Math.max(0, Number(counter.used) || 0), 0);
    const used = Math.max(recorded, observed);

    if (counters.length === 0) {
        if (used === 0) return { used: 0, counterId: null };
        const created = await PracticeUsageCounter.create({ ...filter, used });
        return { used: created.used, counterId: created._id };
    }

    const [canonical, ...duplicates] = counters;
    if ((Number(canonical.used) || 0) !== used) {
        await PracticeUsageCounter.updateOne({ _id: canonical._id }, { $set: { used } });
    }
    if (duplicates.length > 0) {
        await PracticeUsageCounter.deleteMany({ _id: { $in: duplicates.map((counter) => counter._id) } });
    }

    return { used, counterId: canonical._id };
};

export const reservePracticeUsage = async ({ userId, metric, period, limit }) => {
    let state = await reconcilePracticeUsageCounter({ userId, metric, period });
    if (state.used >= limit) return { allowed: false, used: state.used, counterId: state.counterId };

    if (!state.counterId) {
        try {
            const created = await PracticeUsageCounter.create({ user: userId, metric, period, used: 1 });
            return { allowed: true, used: 1, counterId: created._id };
        } catch (error) {
            if (error?.code !== 11000) throw error;
            state = await reconcilePracticeUsageCounter({ userId, metric, period });
            if (state.used >= limit) return { allowed: false, used: state.used, counterId: state.counterId };
        }
    }

    const updated = await PracticeUsageCounter.findOneAndUpdate(
        { _id: state.counterId, used: { $lt: limit } },
        { $inc: { used: 1 } },
        { new: true },
    );
    if (updated) return { allowed: true, used: updated.used, counterId: updated._id };

    state = await reconcilePracticeUsageCounter({ userId, metric, period });
    return { allowed: false, used: state.used, counterId: state.counterId };
};
