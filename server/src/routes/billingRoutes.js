import express from "express";
import { z } from "zod";
import protect from "../middleware/authMiddleware.js";
import validate from "../middleware/validate.js";
import PaymentOrder from "../models/PaymentOrder.js";
import { confirmPayuOrder } from "../services/payuBilling.js";
import Organization from "../models/Organization.js";
import OrganizationUsageCounter from "../models/OrganizationUsageCounter.js";
import { currentMonth, practiceLimitsFor, PRACTICE_PLAN_LIMITS } from "../services/practiceEntitlements.js";
import { reconcilePracticeUsageCounter } from "../services/practiceUsageAccounting.js";
import { hiringLimitsFor, hiringUsagePeriod, HIRING_PLAN_LIMITS } from "../services/hiringEntitlements.js";
import { getPayuPrice } from "../services/payuCatalog.js";
import { payuConfigured, zionRequest } from "../config/payu.js";
import { createPayuCheckout } from "../services/payuBilling.js";
import { organizationContext, requireOrganizationRole } from "../middleware/organizationContext.js";
import metrics from "../metrics/index.js";

const router = express.Router();
router.get("/catalog", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    return res.json({ prices: { practice: { pro: getPayuPrice("practice", "pro") }, hiring: { pilot: getPayuPrice("hiring", "pilot"), starter: getPayuPrice("hiring", "starter"), growth: getPayuPrice("hiring", "growth") } } });
});
const billingConfigured = () => payuConfigured(true);
const PAID_HIRING_PLANS = new Set(["starter", "growth", "enterprise"]);
const phoneSchema = z.string().regex(/^[+\d][\d\s-]{7,19}$/);

router.get("/practice/entitlements", protect, async (req, res, next) => {
    try {
        res.setHeader("Cache-Control", "no-store");
        const period = currentMonth();
        const limits = practiceLimitsFor(req.user);
        const [interviewUsage, resumeReviewUsage, resumeGenerationUsage] = await Promise.all([
            reconcilePracticeUsageCounter({ userId: req.user._id, metric: "interviews", period }),
            reconcilePracticeUsageCounter({ userId: req.user._id, metric: "resumeReviews", period }),
            reconcilePracticeUsageCounter({ userId: req.user._id, metric: "resumeGenerations", period }),
        ]);
        const proPrice = getPayuPrice("practice", "pro");
        const hasBillingAccount = Boolean(req.user.practiceBillingCustomerId);
        return res.json({
            product: "practice",
            period,
            plan: limits.plan,
            subscriptionStatus: req.user.practiceSubscriptionStatus,
            hasBillingAccount,
            billingProvider: req.user.practiceBillingProvider || "none",
            currentPeriodEnd: req.user.practiceCurrentPeriodEnd,
            cancelAtPeriodEnd: Boolean(req.user.practiceCancelAtPeriodEnd),
            limits: {
                interviews: limits.interviewsPerMonth,
                resumeReviews: limits.resumeReviewsPerMonth,
                resumeGenerations: limits.resumeGenerationsPerMonth,
            },
            planLimits: {
                free: {
                    interviews: PRACTICE_PLAN_LIMITS.free.interviewsPerMonth,
                    resumeReviews: PRACTICE_PLAN_LIMITS.free.resumeReviewsPerMonth,
                    resumeGenerations: PRACTICE_PLAN_LIMITS.free.resumeGenerationsPerMonth,
                },
                pro: {
                    interviews: PRACTICE_PLAN_LIMITS.pro.interviewsPerMonth,
                    resumeReviews: PRACTICE_PLAN_LIMITS.pro.resumeReviewsPerMonth,
                    resumeGenerations: PRACTICE_PLAN_LIMITS.pro.resumeGenerationsPerMonth,
                },
            },
            used: {
                interviews: interviewUsage.used,
                resumeReviews: resumeReviewUsage.used,
                resumeGenerations: resumeGenerationUsage.used,
            },
            prices: { pro: proPrice },
            billingAvailable: { pro: Boolean(billingConfigured() && proPrice?.id) },
        });
    } catch (error) {
        return next(error);
    }
});

router.post("/practice/checkout-session", protect,
    validate(z.object({ plan: z.literal("pro").default("pro"), phone: phoneSchema })), async (req, res, next) => {
        try {
            if (practiceLimitsFor(req.user).plan === "pro") return res.status(409).json({ message: "Manage or cancel your current subscription before starting a new checkout" });
            return res.json(await createPayuCheckout({ product: "practice", plan: "pro", user: req.user, phone: req.body.phone }));
        } catch (error) { metrics.billingCheckoutTotal.labels("failure").inc(); return next(error); }
    });

router.get("/hiring/entitlements", protect, organizationContext, async (req, res, next) => {
    try {
        res.setHeader("Cache-Control", "no-store");
        const limits = hiringLimitsFor(req.organization);
        const period = hiringUsagePeriod(req.organization);
        const [counter, billingOrganization] = await Promise.all([
            OrganizationUsageCounter.findOne({
                organization: req.organizationId,
                metric: "candidateInterviews",
                period: period.key,
            }).lean(),
            Organization.findById(req.organizationId).select("+hiringBillingCustomerId +hiringBillingProvider").lean(),
        ]);
        const pilotPrice = getPayuPrice("hiring", "pilot");
        const starterPrice = getPayuPrice("hiring", "starter");
        const growthPrice = getPayuPrice("hiring", "growth");
        const used = counter?.used || 0;
        // In-progress candidates hold a reservation that counts toward the limit when starting new attempts.
        const reserved = counter?.reserved || 0;
        const hasBillingAccount = Boolean(billingOrganization?.hiringBillingCustomerId);
        return res.json({
            product: "hiring",
            organization: { _id: req.organization._id, name: req.organization.name },
            plan: limits.plan,
            accessType: limits.accessType,
            subscriptionStatus: req.organization.hiringSubscriptionStatus,
            hasBillingAccount,
            billingProvider: billingOrganization?.hiringBillingProvider || "none",
            currentPeriodEnd: req.organization.hiringCurrentPeriodEnd,
            cancelAtPeriodEnd: Boolean(req.organization.hiringCancelAtPeriodEnd),
            period: period.key,
            periodType: period.cadence,
            limits: { candidateInterviews: limits.candidateInterviews },
            used: { candidateInterviews: used },
            reserved: { candidateInterviews: reserved },
            remaining: Math.max(limits.candidateInterviews - used - reserved, 0),
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
                pilot: Boolean(payuConfigured() && pilotPrice),
                starter: Boolean(billingConfigured() && starterPrice?.id),
                growth: Boolean(billingConfigured() && growthPrice?.id),
            },
            canManageBilling: ["owner", "admin"].includes(req.organizationRole),
        });
    } catch (error) {
        return next(error);
    }
});

const hiringCheckout = (pilot) => async (req, res, next) => {
    try {
        const organization = await Organization.findById(req.organizationId).select("+hiringBillingCustomerId +hiringBillingSubscriptionId +hiringBillingProvider");
        if (!organization) return res.status(404).json({ message: "Organization not found" });
        const limits = hiringLimitsFor(organization);
        if (PAID_HIRING_PLANS.has(limits.plan) || (pilot && limits.plan === "paid_pilot")) return res.status(409).json({ message: "Manage or cancel the current paid plan before starting another checkout" });
        return res.json(await createPayuCheckout({ product: "hiring", plan: pilot ? "pilot" : req.body.plan, user: req.user, organization, phone: req.body.phone }));
    } catch (error) { metrics.billingCheckoutTotal.labels("failure").inc(); return next(error); }
};
router.post("/hiring/pilot-checkout-session", protect, organizationContext, requireOrganizationRole("owner", "admin"), validate(z.object({ phone: phoneSchema })), hiringCheckout(true));
router.post("/hiring/checkout-session", protect, organizationContext, requireOrganizationRole("owner", "admin"), validate(z.object({ plan: z.enum(["starter", "growth"]), phone: phoneSchema })), hiringCheckout(false));

const cancelPayu = (prefix) => async (req, res, next) => {
    try {
        const Model = prefix === "practice" ? (await import("../models/User.js")).default : Organization;
        const id = prefix === "practice" ? req.user._id : req.organizationId;
        const owner = await Model.findById(id).select(`+${prefix}BillingProvider +${prefix}BillingSubscriptionId`);
        if (owner?.[`${prefix}BillingProvider`] !== "payu" || !owner?.[`${prefix}BillingSubscriptionId`]) return res.status(400).json({ message: "No PayU subscription found" });
        if (!owner[`${prefix}CancelAtPeriodEnd`]) {
            const live = await zionRequest("GET", owner[`${prefix}BillingSubscriptionId`]);
            if (!["Cancelled", "Completed", "Forced_Cancel"].includes(live.status)) await zionRequest("DELETE", owner[`${prefix}BillingSubscriptionId`]);
        }
        await Model.updateOne({ _id: id, [`${prefix}BillingSubscriptionId`]: owner[`${prefix}BillingSubscriptionId`] }, { $set: { [`${prefix}CancelAtPeriodEnd`]: true } });
        return res.json({ canceled: true, accessUntil: owner[`${prefix}CurrentPeriodEnd`] });
    } catch (error) { return next(error); }
};
router.post("/practice/cancel-subscription", protect, cancelPayu("practice"));
router.post("/hiring/cancel-subscription", protect, organizationContext, requireOrganizationRole("owner", "admin"), cancelPayu("hiring"));

router.post("/payment-status/:txnid", protect, async (req, res, next) => {
    try {
        const order = await PaymentOrder.findOne({ txnid: req.params.txnid, user: req.user._id });
        if (!order) return res.status(404).json({ message: "Payment order not found" });
        if (order.status !== "paid") await confirmPayuOrder(order.txnid);
        return res.json({ status: "paid", plan: order.plan });
    } catch (error) { return next(error); }
});
export default router;
