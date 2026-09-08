import express from "express";
import { z } from "zod";
import protect from "../middleware/authMiddleware.js";
import validate from "../middleware/validate.js";
import ProductEvent from "../models/ProductEvent.js";
import metrics from "../metrics/index.js";

const router = express.Router();
const schema = z.object({ event: z.enum(["dashboard_viewed", "pricing_viewed", "checkout_started", "interview_created", "resume_uploaded", "first_answer_submitted", "round_completed", "feedback_viewed", "retry_started", "resume_review_started", "resume_review_completed", "resume_match_completed", "assessment_builder_started", "assessment_draft_saved", "assessment_scheduled", "assessment_published", "seo_resource_practice_started", "seo_resource_assessment_created"]), path: z.string().max(200).optional() }).strict();

router.post("/", protect, validate(schema), async (req, res, next) => {
    try {
        await ProductEvent.create({ user: req.user._id, event: req.body.event, path: req.body.path || req.path, plan: req.user.practicePlan || "free" });
        metrics.productEventsTotal.labels(req.body.event, req.user.practicePlan || "free").inc();
        return res.status(202).json({ accepted: true });
    } catch (error) { return next(error); }
});

export default router;
