import { currentMonth } from "./practiceEntitlements.js";

export const HIRING_PLAN_LIMITS = {
    none: {
        candidateInterviews: 0,
    },
    trial: {
        candidateInterviews: Number(process.env.HIRING_TRIAL_CANDIDATE_INTERVIEWS || 5),
    },
    starter: {
        candidateInterviews: Number(process.env.HIRING_STARTER_CANDIDATE_INTERVIEWS_PER_MONTH || 25),
    },
    growth: {
        candidateInterviews: Number(process.env.HIRING_GROWTH_CANDIDATE_INTERVIEWS_PER_MONTH || 100),
    },
    enterprise: {
        candidateInterviews: Number(process.env.HIRING_ENTERPRISE_CANDIDATE_INTERVIEWS_PER_MONTH || 100000),
    },
};

const PAID_PLANS = new Set(["starter", "growth", "enterprise"]);
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);
const GRANT_TYPES = new Set(["design_partner", "paid_pilot"]);

export const activeHiringSubscriptionPlan = (organization) => {
    if (
        PAID_PLANS.has(organization?.hiringPlan)
        && ACTIVE_SUBSCRIPTION_STATUSES.has(organization?.hiringSubscriptionStatus)
        && (!organization?.hiringCurrentPeriodEnd || new Date(organization.hiringCurrentPeriodEnd) > new Date())
    ) {
        return organization.hiringPlan;
    }
    return null;
};

export const activeHiringGrant = (organization, date = new Date()) => {
    const grant = organization?.hiringGrant;
    if (!grant || !GRANT_TYPES.has(grant.type) || !grant.grantId) return null;
    if (!Number.isFinite(Number(grant.candidateInterviews)) || Number(grant.candidateInterviews) <= 0) return null;
    if (grant.startsAt && new Date(grant.startsAt) > date) return null;
    if (grant.expiresAt && new Date(grant.expiresAt) <= date) return null;
    return grant;
};

export const activeHiringPlan = (organization, date = new Date()) => {
    const subscriptionPlan = activeHiringSubscriptionPlan(organization);
    if (subscriptionPlan) return subscriptionPlan;
    const grant = activeHiringGrant(organization, date);
    if (grant) return grant.type;
    return organization?.hiringTrialEligible ? "trial" : "none";
};

export const hiringLimitsFor = (organization, date = new Date()) => {
    const subscriptionPlan = activeHiringSubscriptionPlan(organization);
    if (subscriptionPlan) {
        return { plan: subscriptionPlan, accessType: "subscription", ...HIRING_PLAN_LIMITS[subscriptionPlan] };
    }

    const grant = activeHiringGrant(organization, date);
    if (grant) {
        return {
            plan: grant.type,
            accessType: "grant",
            candidateInterviews: Number(grant.candidateInterviews),
            grantId: grant.grantId,
            startsAt: grant.startsAt || null,
            expiresAt: grant.expiresAt || null,
            note: grant.note || "",
        };
    }

    const plan = organization?.hiringTrialEligible ? "trial" : "none";
    return { plan, accessType: plan === "trial" ? "trial" : "none", ...HIRING_PLAN_LIMITS[plan] };
};

export const hiringUsagePeriod = (organization, date = new Date()) => {
    const limits = hiringLimitsFor(organization, date);
    if (["starter", "growth", "enterprise"].includes(limits.plan)) {
        return { key: currentMonth(date), cadence: "month" };
    }
    if (limits.accessType === "grant" && limits.grantId) {
        return { key: `grant:${limits.grantId}`, cadence: "grant" };
    }
    return { key: "lifetime", cadence: "lifetime" };
};
