import express from "express";
import {
    uploadResume,
    getUserResumes,
    deleteResume,
    updateResume,
    previewResume,
    reviewResume,
    getResumeReviews,
    deleteResumeReview,
    matchResumesToJob,
} from "../controllers/resumeController.js";
import { downloadAuthenticatedResume } from "../controllers/resumeFileController.js";
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
    protect,
    validate(z.object({ id: ObjectIdString }), "params"),
    downloadAuthenticatedResume
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
