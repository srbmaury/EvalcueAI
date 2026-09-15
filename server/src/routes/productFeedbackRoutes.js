import express from "express";
import { z } from "zod";
import protect from "../middleware/authMiddleware.js";
import validate from "../middleware/validate.js";
import { uploadFeedbackPhotosMulter } from "../middleware/multerMemory.js";
import { uploadLimiter } from "../middleware/rateLimiters.js";
import { createProductFeedback } from "../controllers/productFeedbackController.js";

const router = express.Router();
const schema = z.object({
    category: z.enum(["idea", "problem", "praise", "other"]),
    message: z.string().trim().min(3).max(2000),
    page: z.string().trim().max(300).optional(),
});

router.post("/", protect, uploadLimiter, uploadFeedbackPhotosMulter.array("photos", 4), validate(schema), createProductFeedback);

export default router;
