export const PRACTICE_PLAN_LIMITS = {
    free: {
        interviewsPerMonth: Number(process.env.FREE_INTERVIEWS_PER_MONTH || 3),
        resumeReviewsPerMonth: Number(process.env.FREE_RESUME_REVIEWS_PER_MONTH || 10),
        resumeGenerationsPerMonth: Number(process.env.FREE_RESUME_GENERATIONS_PER_MONTH || 10),
    },
    pro: {
        interviewsPerMonth: Number(process.env.PRO_INTERVIEWS_PER_MONTH || 100),
        resumeReviewsPerMonth: Number(process.env.PRO_RESUME_REVIEWS_PER_MONTH || 100),
        resumeGenerationsPerMonth: Number(process.env.PRO_RESUME_GENERATIONS_PER_MONTH || 100),
    },
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

export const activePracticePlan = (user) => (
    user?.practicePlan === "pro" && ACTIVE_SUBSCRIPTION_STATUSES.has(user?.practiceSubscriptionStatus)
    && (!user?.practiceCurrentPeriodEnd || new Date(user.practiceCurrentPeriodEnd) > new Date())
        ? "pro"
        : "free"
);

export const practiceLimitsFor = (user) => {
    const plan = activePracticePlan(user);
    return { plan, ...PRACTICE_PLAN_LIMITS[plan] };
};

export const currentMonth = (date = new Date()) => date.toISOString().slice(0, 7);
