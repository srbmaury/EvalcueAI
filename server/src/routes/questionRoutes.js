import express from "express";
import protect from "../middleware/authMiddleware.js";
import validate from "../middleware/validate.js";
import quotas from "../middleware/quotas.js";
import { z } from "zod";
import { ObjectIdString } from "../validation/commonSchemas.js";
import audit from "../middleware/audit.js";
import {
    prepareQuestionsForRound,
    submitConversationalAnswer,
    submitOAAnswers,
    completeRound,
    skipRound,
    clarifyCurrentQuestion,
    submitFollowUpAnswer,
} from "../controllers/questionController.js";
import {
    checkpointPracticeSystemDesign,
    savePracticeSystemDesign,
} from "../controllers/systemDesignDiscussionController.js";

const router = express.Router();

/**
 * @openapi
 * /api/questions/{interviewId}/rounds/{roundId}/prepare:
 *   post:
 *     tags: [Questions]
 *     summary: Generate questions for a round
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: interviewId
 *         schema: { type: string }
 *         required: true
 *       - in: path
 *         name: roundId
 *         schema: { type: string }
 *         required: true
 *     responses:
 *       200:
 *         description: Questions prepared
 *
 * /api/questions/{roundId}/answer:
 *   post:
 *     tags: [Questions]
 *     summary: Submit conversational answer
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: roundId
 *         schema: { type: string }
 *         required: true
 *     responses:
 *       200:
 *         description: Answer received
 *
 * /api/questions/{roundId}/answers:
 *   post:
 *     tags: [Questions]
 *     summary: Submit OA answers
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: roundId
 *         schema: { type: string }
 *         required: true
 *     responses:
 *       200:
 *         description: Answers received
 *
 * /api/questions/{roundId}/complete:
 *   post:
 *     tags: [Questions]
 *     summary: Mark round complete
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: roundId
 *         schema: { type: string }
 *         required: true
 *     responses:
 *       200:
 *         description: Round completed
 *
 * /api/questions/{roundId}/clarify:
 *   post:
 *     tags: [Questions]
 *     summary: Clarify a candidate doubt for the current question
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: roundId
 *         schema: { type: string }
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: Clarification answer
 *
 * /api/questions/{interviewId}/rounds/{roundId}:
 *   delete:
 *     tags: [Questions]
 *     summary: Skip and delete a round
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: interviewId
 *         schema: { type: string }
 *         required: true
 *       - in: path
 *         name: roundId
 *         schema: { type: string }
 *         required: true
 *     responses:
 *       200:
 *         description: Round skipped
 */

const systemDesignDiscussionBody = z.object({
    transcript: z.string().max(20000).optional().default(""),
    diagramData: z.string().max(500000).optional().default(""),
    previousInterjections: z.array(z.string().max(600)).max(8).optional().default([]),
    forceInteraction: z.boolean().optional().default(false),
    candidateAskedQuestion: z.boolean().optional().default(false),
    candidateQuestion: z.string().max(300).optional().default(""),
});

router.post(
    "/:interviewId/rounds/:roundId/prepare",
    protect,
    validate(z.object({ interviewId: ObjectIdString, roundId: ObjectIdString }), "params"),
    validate(z.object({ count: z.number().int().min(1).max(20).optional(), prefetch: z.boolean().optional() })),
    audit("round.prepare", { entityType: "Round", getEntityId: (req) => req.params.roundId, pickBody: (b) => ({ count: b.count }) }),
    prepareQuestionsForRound
);

router.post(
    "/:roundId/answer",
    protect,
    validate(z.object({ roundId: ObjectIdString }), "params"),
    validate(z.object({ index: z.coerce.number().int().min(0), answer: z.string().max(5000).optional() })),
    audit("round.answer.submit", { entityType: "Round", getEntityId: (req) => req.params.roundId, pickBody: (b) => ({ index: b.index }) }),
    submitConversationalAnswer
);

router.post(
    "/:roundId/answers",
    protect,
    validate(z.object({ roundId: ObjectIdString }), "params"),
    validate(z.object({ answers: z.array(z.string().max(5000)).min(1) })),
    audit("round.answers.submit", { entityType: "Round", getEntityId: (req) => req.params.roundId }),
    submitOAAnswers
);

router.post(
    "/:roundId/system-design/checkpoint",
    protect,
    quotas({
        key: (req) => `user:${req.user?._id || "anon"}:system-design-checkpoint:${req.params.roundId}`,
        metricKey: "system_design_checkpoint",
        windowSeconds: 60 * 60,
        maxPerWindow: 240,
    }),
    validate(z.object({ roundId: ObjectIdString }), "params"),
    validate(systemDesignDiscussionBody),
    checkpointPracticeSystemDesign
);

router.post(
    "/:roundId/system-design/complete",
    protect,
    validate(z.object({ roundId: ObjectIdString }), "params"),
    validate(systemDesignDiscussionBody.extend({ transcript: z.string().trim().min(1).max(20000) })),
    audit("round.system_design.save", { entityType: "Round", getEntityId: (req) => req.params.roundId }),
    savePracticeSystemDesign
);

router.post(
    "/:roundId/complete",
    protect,
    validate(z.object({ roundId: ObjectIdString }), "params"),
    audit("round.complete", { entityType: "Round", getEntityId: (req) => req.params.roundId }),
    completeRound
);

router.post(
    "/:roundId/follow-up-answer",
    protect,
    validate(z.object({ roundId: ObjectIdString }), "params"),
    validate(z.object({ index: z.coerce.number().int().min(0), answer: z.string().max(5000).optional().default(""), skip: z.boolean().optional().default(false) })),
    audit("round.followup.answer", { entityType: "Round", getEntityId: (req) => req.params.roundId, pickBody: (body) => ({ index: body.index }) }),
    submitFollowUpAnswer
);

router.post(
    "/:roundId/clarify",
    protect,
    validate(z.object({ roundId: ObjectIdString }), "params"),
    validate(z.object({ message: z.string().min(1).max(600) })),
    audit("round.clarify", { entityType: "Round", getEntityId: (req) => req.params.roundId }),
    clarifyCurrentQuestion
);

// Skip and delete a round and its associated questions/feedback
router.delete(
    "/:interviewId/rounds/:roundId",
    protect,
    validate(z.object({ interviewId: ObjectIdString, roundId: ObjectIdString }), "params"),
    audit("round.skip", { entityType: "Round", getEntityId: (req) => req.params.roundId }),
    skipRound
);

export default router;
