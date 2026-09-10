import express from "express";
import { z } from "zod";
import protect from "../middleware/authMiddleware.js";
import validate from "../middleware/validate.js";
import Organization from "../models/Organization.js";
import OrganizationUsageCounter from "../models/OrganizationUsageCounter.js";
import { currentMonth, practiceLimitsFor, PRACTICE_PLAN_LIMITS } from "../services/practiceEntitlements.js";
import { reconcilePracticeUsageCounter } from "../services/practiceUsageAccounting.js";
import { hiringLimitsFor, hiringUsagePeriod, HIRING_PLAN_LIMITS } from "../services/hiringEntitlements.js";
import { getStripe } from "../config/stripe.js";
import { getConfiguredPriceId, getOneTimePrice, getPlanPrice } from "../services/billingCatalog.js";
import { organizationContext, requireOrganizationRole } from "../middleware/organizationContext.js";
import metrics from "../metrics/index.js";
import { hiringClientOrigin, practiceClientOrigin } from "../config/clientOrigins.js";

const router = express.Router();
const billingConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
const PORTAL_REQUIRED_STATUSES = new Set(["incomplete", "trialing", "active", "past_due", "unpaid", "paused"]);
const PAID_HIRING_PLANS = new Set(["starter", "growth", "enterprise"]);
const requiresBillingPortal = (hasBillingAccount, subscriptionStatus) => (
    Boolean(hasBillingAccount) && PORTAL_REQUIRED_STATUSES.has(subscriptionStatus)
);

const safePrice = async (product, plan) => {
    try {
        if (process.env.NODE_ENV === "test" || !process.env.STRIPE_SECRET_KEY) return null;
        return await getPlanPrice(product, plan);
    } catch (error) {
        console.warn(`Stripe ${product} ${plan} price lookup failed`, error?.message || error);
        return null;
    }
};

const safeOneTimePrice = async (product, plan) => {
    try {
        if (process.env.NODE_ENV === "test" || !process.env.STRIPE_SECRET_KEY) return null;
        return await getOneTimePrice(product, plan);
    } catch (error) {
        console.warn(`Stripe ${product} ${plan} one-time price lookup failed`, error?.message || error);
        return null;
    }
};

router.get("/practice/entitlements", protect, async (req, res, next) => {
    try {
        res.setHeader("Cache-Control", "no-store");
        const period = currentMonth();
        const limits = practiceLimitsFor(req.user);
        const [interviewUsage, resumeReviewUsage] = await Promise.all([
            reconcilePracticeUsageCounter({ userId: req.user._id, metric: "interviews", period }),
            reconcilePracticeUsageCounter({ userId: req.user._id, metric: "resumeReviews", period }),
        ]);
        const proPrice = await safePrice("practice", "pro");
        const hasBillingAccount = Boolean(req.user.practiceBillingCustomerId);
        return res.json({
            product: "practice",
            period,
            plan: limits.plan,
            subscriptionStatus: req.user.practiceSubscriptionStatus,
            hasBillingAccount,
            requiresBillingPortal: requiresBillingPortal(hasBillingAccount, req.user.practiceSubscriptionStatus),
            limits: {
                interviews: limits.interviewsPerMonth,
                resumeReviews: limits.resumeReviewsPerMonth,
            },
            planLimits: {
                free: {
                    interviews: PRACTICE_PLAN_LIMITS.free.interviewsPerMonth,
                    resumeReviews: PRACTICE_PLAN_LIMITS.free.resumeReviewsPerMonth,
                },
                pro: {
                    interviews: PRACTICE_PLAN_LIMITS.pro.interviewsPerMonth,
                    resumeReviews: PRACTICE_PLAN_LIMITS.pro.resumeReviewsPerMonth,
                },
            },
            used: {
                interviews: interviewUsage.used,
                resumeReviews: resumeReviewUsage.used,
            },
            prices: { pro: proPrice },
            billingAvailable: { pro: Boolean(billingConfigured() && proPrice) },
        });
    } catch (error) {
        return next(error);
    }
});

router.post(
    "/practice/checkout-session",
    protect,
    validate(z.object({ plan: z.literal("pro").optional().default("pro") })),
    async (req, res, next) => {
        try {
            const selectedPlan = req.body.plan;
            const priceId = getConfiguredPriceId("practice", selectedPlan);
            if (!priceId) return res.status(503).json({ message: "Practice Pro checkout is not configured" });
            if (practiceLimitsFor(req.user).plan === "pro") return res.status(409).json({ message: "Practice Pro is already active" });
            if (requiresBillingPortal(Boolean(req.user.practiceBillingCustomerId), req.user.practiceSubscriptionStatus)) {
                return res.status(409).json({ message: "Use Manage billing to resolve or change your existing Practice subscription" });
            }
            const session = await getStripe().checkout.sessions.create({
                mode: "subscription",
                line_items: [{ price: priceId, quantity: 1 }],
                customer: req.user.practiceBillingCustomerId || undefined,
                customer_email: req.user.practiceBillingCustomerId ? undefined : req.user.email,
                client_reference_id: String(req.user._id),
                metadata: { billingProduct: "practice", userId: String(req.user._id), plan: selectedPlan },
                subscription_data: { metadata: { billingProduct: "practice", userId: String(req.user._id), plan: selectedPlan } },
                allow_promotion_codes: true,
                success_url: `${practiceClientOrigin()}/practice/billing/success?product=practice`,
                cancel_url: `${practiceClientOrigin()}/practice/pricing?checkout=cancelled`,
            });
            metrics.billingCheckoutTotal.labels("success").inc();
            return res.json({ url: session.url });
        } catch (error) {
            metrics.billingCheckoutTotal.labels("failure").inc();
            return next(error);
        }
    },
);

router.post("/practice/portal-session", protect, async (req, res, next) => {
    try {
        if (!req.user.practiceBillingCustomerId) return res.status(400).json({ message: "No Practice billing account found" });
        const session = await getStripe().billingPortal.sessions.create({
            customer: req.user.practiceBillingCustomerId,
            return_url: `${practiceClientOrigin()}/practice/pricing`,
        });
        return res.json({ url: session.url });
    } catch (error) {
        return next(error);
    }
});

router.get("/hiring/entitlements", protect, organizationContext, async (req, res, next) => {
    try {
        res.setHeader("Cache-Control", "no-store");
        const limits = hiringLimitsFor(req.organization);
        const period = hiringUsagePeriod(req.organization);
        const [counter, billingOrganization, pilotPrice, starterPrice, growthPrice] = await Promise.all([
            OrganizationUsageCounter.findOne({
                organization: req.organizationId,
                metric: "candidateInterviews",
                period: period.key,
            }).lean(),
            Organization.findById(req.organizationId).select("+hiringBillingCustomerId").lean(),
            safeOneTimePrice("hiring", "pilot"),
            safePrice("hiring", "starter"),
            safePrice("hiring", "growth"),
        ]);
        const used = counter?.used || 0;
        const hasBillingAccount = Boolean(billingOrganization?.hiringBillingCustomerId);
        return res.json({
            product: "hiring",
            organization: { _id: req.organization._id, name: req.organization.name },
            plan: limits.plan,
            accessType: limits.accessType,
            subscriptionStatus: req.organization.hiringSubscriptionStatus,
            hasBillingAccount,
            requiresBillingPortal: requiresBillingPortal(hasBillingAccount, req.organization.hiringSubscriptionStatus),
            period: period.key,
            periodType: period.cadence,
            limits: { candidateInterviews: limits.candidateInterviews },
            used: { candidateInterviews: used },
            remaining: Math.max(limits.candidateInterviews - used, 0),
            grant: limits.accessType === "grant" ? {
                type: limits.plan,
                grantId: limits.grantId,
                startsAt: limits.startsAt,
                expiresAt: limits.expiresAt,
                note: limits.note,
            } : null,
            planLimits: Object.fromEntries(
                Object.entries(HIRING_PLAN_LIMITS)
                    .filter(([plan]) => plan !== "none")
                    .map(([plan, value]) => [plan, { candidateInterviews: value.candidateInterviews }]),
            ),
            pilotOffer: {
                candidateInterviews: Number(process.env.HIRING_PAID_PILOT_CANDIDATE_INTERVIEWS || 15),
                validDays: Number(process.env.HIRING_PAID_PILOT_VALID_DAYS || 30),
            },
            prices: { pilot: pilotPrice, starter: starterPrice, growth: growthPrice },
            billingAvailable: {
                pilot: Boolean(billingConfigured() && pilotPrice),
                starter: Boolean(billingConfigured() && starterPrice),
                growth: Boolean(billingConfigured() && growthPrice),
            },
            canManageBilling: ["owner", "admin"].includes(req.organizationRole),
        });
    } catch (error) {
        return next(error);
    }
});

router.post(
    "/hiring/pilot-checkout-session",
    protect,
    organizationContext,
    requireOrganizationRole("owner", "admin"),
    async (req, res, next) => {
        try {
            const priceId = getConfiguredPriceId("hiring", "pilot");
            if (!priceId) return res.status(503).json({ message: "Hiring paid pilot checkout is not configured" });
            const organization = await Organization.findById(req.organizationId)
                .select("+hiringBillingCustomerId +hiringBillingSubscriptionId");
            if (!organization) return res.status(404).json({ message: "Organization not found" });
            const limits = hiringLimitsFor(organization);
            if (PAID_HIRING_PLANS.has(limits.plan)) {
                return res.status(409).json({ message: "This organization already has a paid Hiring subscription" });
            }
            if (limits.plan === "paid_pilot") {
                return res.status(409).json({ message: "This organization already has an active paid pilot" });
            }
            if (requiresBillingPortal(Boolean(organization.hiringBillingCustomerId), organization.hiringSubscriptionStatus)) {
                return res.status(409).json({ message: "Resolve this organization's existing Hiring subscription before starting a pilot" });
            }

            const candidateInterviews = Math.max(1, Math.min(1000, Number(process.env.HIRING_PAID_PILOT_CANDIDATE_INTERVIEWS || 15)));
            const validDays = Math.max(1, Math.min(365, Number(process.env.HIRING_PAID_PILOT_VALID_DAYS || 30)));
            const existingCustomer = organization.hiringBillingCustomerId || "";
            const metadata = {
                billingProduct: "hiring",
                purchaseType: "paid_pilot",
                organizationId: String(organization._id),
                purchasedByUserId: String(req.user._id),
                candidateInterviews: String(candidateInterviews),
                validDays: String(validDays),
            };
            const session = await getStripe().checkout.sessions.create({
                mode: "payment",
                line_items: [{ price: priceId, quantity: 1 }],
                customer: existingCustomer || undefined,
                customer_creation: existingCustomer ? undefined : "always",
                customer_email: existingCustomer ? undefined : req.user.email,
                client_reference_id: String(organization._id),
                metadata,
                payment_intent_data: { metadata },
                success_url: `${hiringClientOrigin()}/hire/billing/success?product=hiring&purchase=pilot&organizationId=${organization._id}`,
                cancel_url: `${hiringClientOrigin()}/hire/team?billing=cancelled`,
            });
            metrics.billingCheckoutTotal.labels("success").inc();
            return res.json({ url: session.url });
        } catch (error) {
            metrics.billingCheckoutTotal.labels("failure").inc();
            return next(error);
        }
    },
);

router.post(
    "/hiring/checkout-session",
    protect,
    organizationContext,
    requireOrganizationRole("owner", "admin"),
    validate(z.object({ plan: z.enum(["starter", "growth"]) })),
    async (req, res, next) => {
        try {
            const selectedPlan = req.body.plan;
            const priceId = getConfiguredPriceId("hiring", selectedPlan);
            if (!priceId) return res.status(503).json({ message: `${selectedPlan === "growth" ? "Growth" : "Starter"} checkout is not configured` });
            if (hiringLimitsFor(req.organization).plan === selectedPlan) {
                return res.status(409).json({ message: `Hiring ${selectedPlan} is already active for this organization` });
            }
            const organization = await Organization.findById(req.organizationId)
                .select("+hiringBillingCustomerId +hiringBillingSubscriptionId");
            if (!organization) return res.status(404).json({ message: "Organization not found" });
            if (requiresBillingPortal(Boolean(organization.hiringBillingCustomerId), organization.hiringSubscriptionStatus)) {
                return res.status(409).json({ message: "Use Manage billing to resolve or change this organization's existing Hiring subscription" });
            }
            const session = await getStripe().checkout.sessions.create({
                mode: "subscription",
                line_items: [{ price: priceId, quantity: 1 }],
                customer: organization.hiringBillingCustomerId || undefined,
                customer_email: organization.hiringBillingCustomerId ? undefined : req.user.email,
                client_reference_id: String(organization._id),
                metadata: {
                    billingProduct: "hiring",
                    organizationId: String(organization._id),
                    purchasedByUserId: String(req.user._id),
                    plan: selectedPlan,
                },
                subscription_data: {
                    metadata: {
                        billingProduct: "hiring",
                        organizationId: String(organization._id),
                        purchasedByUserId: String(req.user._id),
                        plan: selectedPlan,
                    },
                },
                allow_promotion_codes: true,
                success_url: `${hiringClientOrigin()}/hire/billing/success?product=hiring&organizationId=${organization._id}`,
                cancel_url: `${hiringClientOrigin()}/hire/team?billing=cancelled`,
            });
            metrics.billingCheckoutTotal.labels("success").inc();
            return res.json({ url: session.url });
        } catch (error) {
            metrics.billingCheckoutTotal.labels("failure").inc();
            return next(error);
        }
    },
);

router.post(
    "/hiring/portal-session",
    protect,
    organizationContext,
    requireOrganizationRole("owner", "admin"),
    async (req, res, next) => {
        try {
            const organization = await Organization.findById(req.organizationId).select("+hiringBillingCustomerId");
            if (!organization?.hiringBillingCustomerId) return res.status(400).json({ message: "No Hiring billing account found for this organization" });
            const session = await getStripe().billingPortal.sessions.create({
                customer: organization.hiringBillingCustomerId,
                return_url: `${hiringClientOrigin()}/hire/team`,
            });
            return res.json({ url: session.url });
        } catch (error) {
            return next(error);
        }
    },
);

export default router;
