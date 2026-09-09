import express from "express";
import {
    uploadResume,
    getUserResumes,
    deleteResume,
    updateResume,
    previewResume,
    downloadResumeFile,
    reviewResume,
    getResumeReviews,
    deleteResumeReview,
    matchResumesToJob,
} from "../controllers/resumeController.js";
import { uploadResumeMulter } from "../middleware/multerMemory.js";
import { uploadLimiter } from "../middleware/rateLimiters.js";
import protect from "../middleware/authMiddleware.js";
import audit from "../middleware/audit.js";
import validate from "../middleware/validate.js";
import { z } from "zod";
import { ObjectIdString } from "../validation/commonSchemas.js";
import practiceUsageLimit from "../middleware/practiceUsageLimit.js";
import quotas from "../middleware/quotas.js";

const router = express.Router();

/**
 * @openapi
 * /api/resumes:
 *   post:
 *     tags: [Resumes]
 *     summary: Upload a resume PDF
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               resume:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Resume uploaded
 *   get:
 *     tags: [Resumes]
 *     summary: List current user's resumes
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: ["-createdAt", "createdAt", "fileName", "-fileName"] }
 *       - in: query
 *         name: tag
 *         schema: { type: string }
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of resumes
 *
 * /api/resumes/{id}:
 *   put:
 *     tags: [Resumes]
 *     summary: Update resume metadata (rename, tags, notes)
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fileName: { type: string }
 *               tags: { type: array, items: { type: string } }
 *               notes: { type: string }
 *     responses:
 *       200:
 *         description: Resume updated
 *   delete:
 *     tags: [Resumes]
 *     summary: Delete a resume by id
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
 *         description: Deleted
 * /api/resumes/{id}/preview:
 *   get:
 *     tags: [Resumes]
 *     summary: Preview a PDF resume inline
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
 *         description: PDF stream
 * /api/resumes/{id}/review:
 *   post:
 *     tags: [Resumes]
 *     summary: Generate AI review for a resume
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ResumeReviewRequest'
 *     responses:
 *       200:
 *         description: JSON review
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResumeReviewResponse'
 */

router.post("/", protect, uploadLimiter, uploadResumeMulter.single("resume"), audit("resume.upload", { entityType: "Resume" }), uploadResume);
router.get(
    "/",
    protect,
    validate(z.object({ sort: z.string().optional(), tag: z.string().optional(), q: z.string().optional(), page: z.coerce.number().int().min(1).optional(), limit: z.coerce.number().int().min(1).max(100).optional() }), "query"),
    getUserResumes
);
router.get("/reviews", protect, validate(z.object({ page: z.coerce.number().int().min(1).optional(), limit: z.coerce.number().int().min(1).max(50).optional() }), "query"), getResumeReviews);
router.post(
    "/match",
    protect,
    quotas({ key: (req) => `user:${req.user._id}:resume-match`, metricKey: "resume_match", windowSeconds: 3600, maxPerWindow: 30 }),
    validate(z.object({ role: z.string().trim().max(200).optional().default(""), jobDescription: z.string().trim().min(40).max(12000) })),
    audit("resume.match", { entityType: "Resume", pickBody: () => ({}) }),
    matchResumesToJob
);
router.delete(
    "/reviews/:reviewId",
    protect,
    validate(z.object({ reviewId: ObjectIdString }), "params"),
    deleteResumeReview
);
router.get(
    "/:id/file",
    validate(z.object({ id: ObjectIdString }), "params"),
    validate(z.object({ expires: z.coerce.number().int().positive(), signature: z.string().min(20).max(200) }), "query"),
    downloadResumeFile
);
router.delete(
    "/:id",
    protect,
    validate(z.object({ id: ObjectIdString }), "params"),
    audit("resume.delete", { entityType: "Resume", getEntityId: (req) => req.params.id }),
    deleteResume
);
router.put(
    "/:id",
    protect,
    validate(z.object({ id: ObjectIdString }), "params"),
    validate(z.object({ fileName: z.string().min(1).max(200).optional(), tags: z.array(z.string().min(1).max(50)).optional(), notes: z.string().max(5000).optional() })),
    audit("resume.update", { entityType: "Resume", getEntityId: (req) => req.params.id, pickBody: (b) => ({ fileName: b.fileName, tags: Array.isArray(b.tags) ? b.tags.length : undefined }) }),
    updateResume
);
router.get(
    "/:id/preview",
    protect,
    validate(z.object({ id: ObjectIdString }), "params"),
    previewResume
);
router.post(
    "/:id/review",
    protect,
    validate(z.object({ id: ObjectIdString }), "params"),
    validate(z.object({ role: z.string().optional(), jobDescription: z.string().optional() })),
    practiceUsageLimit("resumeReviews", "resumeReviewsPerMonth"),
    audit("resume.review", { entityType: "Resume", getEntityId: (req) => req.params.id }),
    reviewResume
);

export default router;
