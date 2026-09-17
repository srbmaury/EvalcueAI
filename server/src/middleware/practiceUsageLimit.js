import PracticeUsageCounter from "../models/PracticeUsageCounter.js";
import { currentMonth, practiceLimitsFor } from "../services/practiceEntitlements.js";
import { reservePracticeUsage } from "../services/practiceUsageAccounting.js";

const metricLabels = {
    interviews: "practice interviews",
    resumeReviews: "resume reviews",
    resumeGenerations: "tailored resume generations",
};

export default function practiceUsageLimit(metric, limitKey) {
    return async (req, res, next) => {
        try {
            const limits = practiceLimitsFor(req.user);
            const limit = limits[limitKey];
            const period = currentMonth();
            const reservation = await reservePracticeUsage({
                userId: req.user._id,
                metric,
                period,
                limit,
            });

            if (!reservation.allowed) {
                const label = metricLabels[metric] || metric;
                const planLabel = limits.plan === "pro" ? "Practice Pro" : "Practice Free";
                return res.status(429).json({
                    message: `You’ve used all ${limit} ${label} included in your ${planLabel} plan this month. Your allowance resets next month, or you can upgrade in Practice plans.`,
                    code: "PRACTICE_LIMIT_REACHED",
                    metric,
                    limit,
                    period,
                    used: reservation.used,
                });
            }

            let released = false;
            const release = async () => {
                if (released || !reservation.counterId) return;
                released = true;
                await PracticeUsageCounter.updateOne(
                    { _id: reservation.counterId, used: { $gt: 0 } },
                    { $inc: { used: -1 } },
                ).catch(() => {});
            };
            res.on("finish", () => { if (res.statusCode >= 400) release(); });
            req.usageReservation = {
                product: "practice",
                metric,
                period,
                limit,
                used: reservation.used,
            };
            return next();
        } catch (error) {
            return next(error);
        }
    };
}
