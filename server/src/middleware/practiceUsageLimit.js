import PracticeUsageCounter from "../models/PracticeUsageCounter.js";
import { currentMonth, practiceLimitsFor } from "../services/practiceEntitlements.js";
import { reconcilePracticeUsageCounter } from "../services/practiceUsageAccounting.js";

const metricLabels = {
    interviews: "practice interviews",
    resumeReviews: "resume reviews",
};

export default function practiceUsageLimit(metric, limitKey) {
    return async (req, res, next) => {
        try {
            const limits = practiceLimitsFor(req.user);
            const limit = limits[limitKey];
            const period = currentMonth();
            await reconcilePracticeUsageCounter({ userId: req.user._id, metric, period });
            const filter = { user: req.user._id, metric, period, used: { $lt: limit } };
            let counter = await PracticeUsageCounter.findOneAndUpdate(
                filter,
                { $inc: { used: 1 } },
                { new: true },
            );
            if (!counter) {
                try {
                    counter = await PracticeUsageCounter.create({ user: req.user._id, metric, period, used: 1 });
                } catch {
                    counter = await PracticeUsageCounter.findOneAndUpdate(
                        filter,
                        { $inc: { used: 1 } },
                        { new: true },
                    );
                }
            }
            if (!counter) {
                const label = metricLabels[metric] || metric;
                const planLabel = limits.plan === "pro" ? "Practice Pro" : "Practice Free";
                return res.status(429).json({
                    message: `You’ve used all ${limit} ${label} included in your ${planLabel} plan this month. Your allowance resets next month, or you can upgrade in Practice plans.`,
                    code: "PRACTICE_LIMIT_REACHED",
                    metric,
                    limit,
                    period,
                });
            }
            let released = false;
            const release = async () => {
                if (released) return;
                released = true;
                await PracticeUsageCounter.updateOne(
                    { _id: counter._id, used: { $gt: 0 } },
                    { $inc: { used: -1 } },
                ).catch(() => {});
            };
            res.on("finish", () => { if (res.statusCode >= 400) release(); });
            req.usageReservation = { product: "practice", metric, period, limit, used: counter.used };
            return next();
        } catch (error) {
            return next(error);
        }
    };
}
