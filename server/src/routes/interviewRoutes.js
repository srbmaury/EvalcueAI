import express from "express";
import { createInterview, getInterviews, getInterview, getProgressSummary, saveCandidateIntro } from "../controllers/interviewController.js";
import protect from "../middleware/authMiddleware.js";
import validate from "../middleware/validate.js";
import { z } from "zod";
import audit from "../middleware/audit.js";
import quotas from "../middleware/quotas.js";
import practiceUsageLimit from "../middleware/practiceUsageLimit.js";

const router = express.Router();

/**
 * @openapi
 * /api/interviews:
 *   post:
 *     tags: [Interviews]
 *     summary: Create interview with fully defined rounds
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Interview created
 *   get:
 *     tags: [Interviews]
 *     summary: List interviews for current user
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         required: false
 *         description: Page number (default 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         required: false
 *         description: Page size (default 10, max 100)
 *     responses:
 *       200:
 *         description: Array of interviews or a paginated object { items, total, page, limit, totalPages }
 *
 * /api/interviews/{id}:
 *   get:
 *     tags: [Interviews]
 *     summary: Get interview by id
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Interview
 */

const isSystemDesignInput = (round = {}) => /system\s*design|architecture/i.test(`${round.roundName || ""} ${round.description || ""} ${(round.skills || []).join(" ")}`);

const RoundInput = z.object({
    roundName: z.string().min(2).max(60),
    description: z.string().min(4).max(260),
    deliveryMode: z.enum(["online-assessment", "conversational"]).optional(),
    questionLimit: z.coerce.number().int().min(1).max(20).optional(),
    skills: z.array(z.string().min(1).max(80)).max(6).optional().default([]),
    rationale: z.string().max(300).optional().default(""),
    recommended: z.boolean().optional().default(true),
}).transform((round) => isSystemDesignInput(round)
    ? { ...round, deliveryMode: "conversational", questionLimit: 1 }
    : round);

const CreateInterviewSchema = z.object({
    resumeId: z.union([z.string().min(1), z.literal(""), z.null()]).optional().default(""),
    company: z.string().max(120).optional().default(""),
    jobRole: z.string().min(1).max(120),
    jobDescription: z.string().min(1).max(5000),
    rounds: z.array(RoundInput).min(1).max(5),
}).transform((d) => ({
    ...d,
    company: d.company?.toString().trim(),
    jobRole: d.jobRole?.toString().trim(),
    jobDescription: d.jobDescription?.toString(),
}));

router.post(
    "/",
    protect,
    quotas({
        key: (req) => `user:${req.user?._id || "anon"}:interview:create`,
        metricKey: "interview_create",
        windowSeconds: 60 * 60,
        maxPerWindow: Number(process.env.QUOTA_INTERVIEW_CREATE_PER_HOUR || 30),
    }),
    validate(CreateInterviewSchema),
    practiceUsageLimit("interviews", "interviewsPerMonth"),
    audit("interview.create", { entityType: "Interview" }),
    createInterview
);
router.get("/", protect, getInterviews);
router.get("/analytics/progress", protect, getProgressSummary);
router.get("/:id", protect, getInterview);
router.put(
    "/:id/intro",
    protect,
    validate(z.object({ answer: z.string().max(3000).optional(), skip: z.boolean().optional() }).strict()),
    saveCandidateIntro
);

export default router;
