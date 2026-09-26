import express from "express";
import protect from "../middleware/authMiddleware.js";
import { uploadAudioMulter } from "../middleware/multerMemory.js";
import { sttLimiter } from "../middleware/rateLimiters.js";
import validate from "../middleware/validate.js";
import { z } from "zod";
import { transcribe } from "../controllers/sttController.js";
import quotas from "../middleware/quotas.js";
import requireFeature from "../middleware/featureFlags.js";

const router = express.Router();

/**
 * @openapi
 * /api/stt/transcribe:
 *   post:
 *     tags: [STT]
 *     summary: Transcribe uploaded audio to text
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               audio:
 *                 type: string
 *                 format: binary
 *                 description: Audio file to transcribe (e.g., WAV/MP3/OGG)
 *     responses:
 *       200:
 *         description: Transcription result
 */
// POST /api/stt/transcribe  (multipart/form-data: field name 'audio')
router.post(
    "/transcribe",
    protect,
    requireFeature("ENABLE_STT"),
    sttLimiter,
    quotas({
        key: (req) => `user:${req.user?._id || "anon"}:stt`,
        metricKey: "stt",
        windowSeconds: 60 * 60, // 1 hour
        maxPerWindow: Number(process.env.QUOTA_STT_PER_HOUR || 600),
    }),
    uploadAudioMulter.single("audio"),
    validate(z.object({ language: z.string().max(10).optional(), prompt: z.string().max(2000).optional() })),
    transcribe
);

export default router;
