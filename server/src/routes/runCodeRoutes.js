import express from "express";
import runCode from "../controllers/runCodeController.js";
import protect from "../middleware/authMiddleware.js";
import { codeExecLimiter } from "../middleware/rateLimiters.js";
import validate from "../middleware/validate.js";
import { z } from "zod";
import quotas from "../middleware/quotas.js";
import requireFeature from "../middleware/featureFlags.js";
import { SNIPPET_RUNTIMES } from "../config/codeRuntimes.js";

const router = express.Router();

/**
 * @openapi
 * /api/run-code:
 *   post:
 *     tags: [RunCode]
 *     summary: Execute code in a sandbox
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RunCodeRequest'
 *     responses:
 *       200:
 *         description: Execution result
 */
router.post(
    "/",
    protect,
    requireFeature("ENABLE_CODE_EXEC"),
    codeExecLimiter,
    quotas({
        key: (req) => `user:${req.user?._id || "anon"}:run-code`,
        metricKey: "run_code",
        windowSeconds: 60 * 60, // 1 hour
        maxPerWindow: Number(process.env.QUOTA_RUN_CODE_PER_HOUR || 120),
    }),
    validate(
        z.object({
            language: z.enum(Object.keys(SNIPPET_RUNTIMES)),
            code: z.string().min(1).max(20000),
            stdin: z.string().max(20000).optional(),
        })
    ),
    runCode
);

export default router;
