import express from "express";
import protect from "../middleware/authMiddleware.js";
import requireRole from "../middleware/requireRole.js";
import validate from "../middleware/validate.js";
import { z } from "zod";
import AuditLog from "../models/AuditLog.js";
import ProductFeedback from "../models/ProductFeedback.js";
import User from "../models/User.js";
import Interview from "../models/Interview.js";
import ProductEvent from "../models/ProductEvent.js";
import { getAiQualitySummary } from "../services/aiQuality.js";
import ReminderDelivery from "../models/ReminderDelivery.js";
import RefreshToken from "../models/RefreshToken.js";
import Organization from "../models/Organization.js";
import OrganizationUsageCounter from "../models/OrganizationUsageCounter.js";
import audit from "../middleware/audit.js";
import { ObjectIdString } from "../validation/commonSchemas.js";
import { getCalibrationSnapshot } from "../services/calibrationAnalytics.js";
import { activeHiringSubscriptionPlan, hiringLimitsFor, hiringUsagePeriod } from "../services/hiringEntitlements.js";

const router = express.Router();

const escapeRegex = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const QuerySchema = z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    user: z.string().optional(),
    action: z.string().optional(),
    entityType: z.string().optional(),
    outcome: z.enum(["success", "failure"]).optional(),
    q: z.string().trim().max(200).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
});

router.get("/overview", protect, requireRole("admin"), async (_req, res, next) => {
    try {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const [users, verifiedUsers, activeSessions, interviews, completedInterviews, newFeedback, failedReminders, events] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ isVerified: true }),
            // Rotated refresh tokens stay until expiry but are dead after their short grace window.
            RefreshToken.countDocuments({ expiresAt: { $gt: new Date() }, replacedByTokenHash: "" }),
            Interview.countDocuments(),
            // overallScore is computed on read and never persisted; "completed" means every round is completed
            // (the same definition the Practice progress page uses).
            Interview.aggregate([
                { $lookup: { from: "rounds", localField: "rounds.round", foreignField: "_id", as: "roundDocs", pipeline: [{ $project: { status: 1 } }] } },
                { $match: { "roundDocs.0": { $exists: true }, roundDocs: { $not: { $elemMatch: { status: { $ne: "completed" } } } } } },
                { $count: "count" },
            ]).then((rows) => rows[0]?.count || 0),
            ProductFeedback.countDocuments({ status: "new" }),
            ReminderDelivery.countDocuments({ status: "failed" }),
            ProductEvent.aggregate([{ $match: { occurredAt: { $gte: since } } }, { $group: { _id: "$event", count: { $sum: 1 } } }]),
        ]);
        return res.json({ users, verifiedUsers, activeSessions, interviews, completedInterviews, newFeedback, failedReminders, events: Object.fromEntries(events.map((item) => [item._id, item.count])), period: "last_30_days" });
    } catch (error) { return next(error); }
});

router.get(
    "/calibration",
    protect,
    requireRole("admin"),
    validate(z.object({ limit: z.coerce.number().int().min(50).max(2000).optional() }), "query"),
    async (req, res, next) => {
        try {
            return res.json(await getCalibrationSnapshot({ limit: req.query.limit }));
        } catch (error) { return next(error); }
    }
);

router.get(
    "/ai-quality",
    protect,
    requireRole("admin"),
    validate(z.object({ days: z.coerce.number().int().min(1).max(180).optional() }), "query"),
    async (req, res, next) => {
        try {
            return res.json(await getAiQualitySummary({ days: req.query.days || 30 }));
        } catch (error) { return next(error); }
    }
);

router.get(
    "/users",
    protect,
    requireRole("admin"),
    validate(z.object({
        q: z.string().trim().max(200).optional(),
        role: z.enum(["user", "admin"]).optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
    }), "query"),
    async (req, res, next) => {
        try {
            const filter = {};
            if (req.query.role) filter.role = req.query.role;
            if (req.query.q) {
                const pattern = new RegExp(escapeRegex(req.query.q), "i");
                filter.$or = [{ name: pattern }, { email: pattern }];
            }
            const users = await User.find(filter)
                .select("_id name email role provider isVerified createdAt")
                .sort({ createdAt: -1 })
                .limit(req.query.limit || 100)
                .lean();
            return res.json({ users });
        } catch (error) { return next(error); }
    },
);

router.patch(
    "/users/:userId/role",
    protect,
    requireRole("admin"),
    validate(z.object({ userId: ObjectIdString }), "params"),
    validate(z.object({ role: z.enum(["user", "admin"]) })),
    audit("admin.user_role_update", {
        entityType: "User",
        getEntityId: (req) => req.params.userId,
        pickBody: (body) => ({ role: body.role }),
    }),
    async (req, res, next) => {
        try {
            const target = await User.findById(req.params.userId).select("_id name email role");
            if (!target) return res.status(404).json({ message: "User not found" });
            if (req.body.role === "user" && String(target._id) === String(req.user._id)) {
                return res.status(400).json({ message: "You cannot demote your own active admin account" });
            }
            if (target.role === "admin" && req.body.role === "user") {
                const adminCount = await User.countDocuments({ role: "admin" });
                if (adminCount <= 1) return res.status(409).json({ message: "At least one platform admin must remain" });
            }
            target.role = req.body.role;
            await target.save();
            return res.json({ user: { _id: target._id, name: target.name, email: target.email, role: target.role } });
        } catch (error) { return next(error); }
    },
);

router.get(
    "/organizations",
    protect,
    requireRole("admin"),
    validate(z.object({ q: z.string().trim().max(200).optional(), limit: z.coerce.number().int().min(1).max(200).optional() }), "query"),
    async (req, res, next) => {
        try {
            const filter = req.query.q ? { name: { $regex: escapeRegex(req.query.q), $options: "i" } } : {};
            const organizations = await Organization.find(filter)
                .sort({ createdAt: -1 })
                .limit(req.query.limit || 100)
                .populate("createdBy", "name email")
                .lean();
            const items = await Promise.all(organizations.map(async (organization) => {
                const limits = hiringLimitsFor(organization);
                const period = hiringUsagePeriod(organization);
                const counter = await OrganizationUsageCounter.findOne({
                    organization: organization._id,
                    metric: "candidateInterviews",
                    period: period.key,
                }).lean();
                return {
                    _id: organization._id,
                    name: organization.name,
                    createdBy: organization.createdBy,
                    createdAt: organization.createdAt,
                    subscriptionStatus: organization.hiringSubscriptionStatus,
                    subscriptionPlan: activeHiringSubscriptionPlan(organization),
                    plan: limits.plan,
                    accessType: limits.accessType,
                    limit: limits.candidateInterviews,
                    used: counter?.used || 0,
                    remaining: Math.max(limits.candidateInterviews - (counter?.used || 0), 0),
                    period: period.key,
                    periodType: period.cadence,
                    grant: limits.accessType === "grant" ? {
                        type: organization.hiringGrant?.type,
                        candidateInterviews: organization.hiringGrant?.candidateInterviews,
                        startsAt: organization.hiringGrant?.startsAt,
                        expiresAt: organization.hiringGrant?.expiresAt,
                        grantId: organization.hiringGrant?.grantId,
                        source: organization.hiringGrant?.source,
                        note: organization.hiringGrant?.note,
                    } : null,
                };
            }));
            return res.json({ organizations: items });
        } catch (error) { return next(error); }
    },
);

router.post(
    "/organizations/:organizationId/hiring-grant",
    protect,
    requireRole("admin"),
    validate(z.object({ organizationId: ObjectIdString }), "params"),
    validate(z.object({
        type: z.enum(["design_partner", "paid_pilot"]),
        candidateInterviews: z.coerce.number().int().min(1).max(1000),
        validDays: z.coerce.number().int().min(1).max(365).default(30),
        note: z.string().trim().max(500).optional().default(""),
    })),
    audit("admin.hiring_grant_create", {
        entityType: "Organization",
        getEntityId: (req) => req.params.organizationId,
        pickBody: (body) => ({ type: body.type, candidateInterviews: body.candidateInterviews, validDays: body.validDays }),
    }),
    async (req, res, next) => {
        try {
            const organization = await Organization.findById(req.params.organizationId);
            if (!organization) return res.status(404).json({ message: "Organization not found" });
            if (activeHiringSubscriptionPlan(organization)) {
                return res.status(409).json({ message: "Active paid subscriptions already define this organization's Hiring capacity" });
            }
            const startsAt = new Date();
            const expiresAt = new Date(startsAt.getTime() + req.body.validDays * 24 * 60 * 60 * 1000);
            organization.hiringTrialEligible = false;
            organization.hiringGrant = {
                type: req.body.type,
                candidateInterviews: req.body.candidateInterviews,
                startsAt,
                expiresAt,
                grantId: `admin:${organization._id}:${Date.now()}`,
                grantedBy: req.user._id,
                source: "admin",
                note: req.body.note,
                stripeCheckoutSessionId: "",
            };
            await organization.save();
            return res.status(201).json({
                grant: organization.hiringGrant,
                message: `${req.body.candidateInterviews} candidate interviews granted for ${req.body.validDays} days`,
            });
        } catch (error) { return next(error); }
    },
);

router.delete(
    "/organizations/:organizationId/hiring-grant",
    protect,
    requireRole("admin"),
    validate(z.object({ organizationId: ObjectIdString }), "params"),
    audit("admin.hiring_grant_revoke", {
        entityType: "Organization",
        getEntityId: (req) => req.params.organizationId,
    }),
    async (req, res, next) => {
        try {
            const organization = await Organization.findById(req.params.organizationId);
            if (!organization) return res.status(404).json({ message: "Organization not found" });
            organization.hiringGrant = {
                type: "none",
                candidateInterviews: 0,
                startsAt: null,
                expiresAt: null,
                grantId: "",
                grantedBy: null,
                source: "none",
                note: "",
                stripeCheckoutSessionId: "",
            };
            await organization.save();
            return res.json({ message: "Hiring grant revoked" });
        } catch (error) { return next(error); }
    },
);

router.get(
    "/audit",
    protect,
    requireRole("admin"),
    validate(QuerySchema, "query"),
    async (req, res) => {
        const { page = 1, limit = 50, user, action, entityType, outcome, q, from, to } = req.query;
        const filter = {};
        if (user) filter.user = user;
        if (action) filter.action = action;
        if (entityType) filter.entityType = entityType;
        if (outcome) filter.outcome = outcome;
        if (from || to) filter.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
        if (q) {
            const escaped = escapeRegex(q);
            filter.$or = ["action", "entityType", "entityId", "requestId", "path"].map((field) => ({ [field]: { $regex: escaped, $options: "i" } }));
        }
        const [total, items] = await Promise.all([
            AuditLog.countDocuments(filter),
            AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate("user", "name email role").lean(),
        ]);
        return res.json({ items, total, page, limit, totalPages: Math.max(Math.ceil(total / limit), 1) });
    }
);

router.get(
    "/feedback",
    protect,
    requireRole("admin"),
    validate(z.object({
        page: z.coerce.number().int().min(1).optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
        status: z.enum(["new", "reviewed", "closed"]).optional(),
        category: z.enum(["idea", "problem", "praise", "other"]).optional(),
        q: z.string().trim().max(200).optional(),
    }), "query"),
    async (req, res, next) => {
        try {
            const { page = 1, limit = 20, status, category, q } = req.query;
            const filter = {};
            if (status) filter.status = status;
            if (category) filter.category = category;
            if (q) filter.message = { $regex: escapeRegex(q), $options: "i" };
            const [total, items] = await Promise.all([
                ProductFeedback.countDocuments(filter),
                ProductFeedback.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate("user", "name email").lean(),
            ]);
            return res.json({ items, total, page, limit, totalPages: Math.max(Math.ceil(total / limit), 1) });
        } catch (error) { return next(error); }
    }
);

router.patch(
    "/feedback/:feedbackId",
    protect,
    requireRole("admin"),
    validate(z.object({ feedbackId: ObjectIdString }), "params"),
    validate(z.object({ status: z.enum(["new", "reviewed", "closed"]) })),
    audit("product_feedback.status_update", { entityType: "ProductFeedback", getEntityId: (req) => req.params.feedbackId, pickBody: (body) => ({ status: body.status }) }),
    async (req, res, next) => {
        try {
            const item = await ProductFeedback.findByIdAndUpdate(req.params.feedbackId, { $set: { status: req.body.status } }, { new: true }).populate("user", "name email");
            if (!item) return res.status(404).json({ message: "Feedback not found" });
            return res.json(item);
        } catch (error) { return next(error); }
    }
);

export default router;
