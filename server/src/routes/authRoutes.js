import express from "express";
import { z } from "zod";
import User from "../models/User.js";
import {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    verifyEmail,
    resendVerification,
    googleSignIn,
    updateProfile,
    forgotPassword,
    resetPassword,
    deleteAccount,
} from "../controllers/authController.js";
import protect from "../middleware/authMiddleware.js";
import requireRole from "../middleware/requireRole.js";
import {
    loginLimiter,
    registerLimiter,
    forgotPasswordLimiter,
    resetPasswordLimiter,
    verifyEmailLimiter,
    resendVerificationLimiter,
    googleLoginLimiter,
} from "../middleware/rateLimiters.js";
import validate from "../middleware/validate.js";
import {
    RegisterSchema,
    LoginSchema,
    VerifyEmailSchema,
    ResendVerificationSchema,
    ForgotPasswordSchema,
    ResetPasswordSchema,
    GoogleIdTokenSchema,
    UpdateProfileSchema,
} from "../validation/authSchemas.js";
import { loginAttemptCheck } from "../middleware/loginLockout.js";
import captcha from "../middleware/captcha.js";
import ReminderDelivery from "../models/ReminderDelivery.js";
import { sendTestPracticeReminder } from "../services/practiceReminders.js";
import Interview from "../models/Interview.js";
import Resume from "../models/Resume.js";
import ResumeReview from "../models/ResumeReview.js";
import SavedExperience from "../models/SavedExperience.js";
import ProductFeedback from "../models/ProductFeedback.js";
import ProductEvent from "../models/ProductEvent.js";
import requireFeature from "../middleware/featureFlags.js";
import audit from "../middleware/audit.js";

const loginCaptcha = (req, res, next) => {
    if ((process.env.CAPTCHA_LOGIN_ENABLED || "").toLowerCase() === "true") {
        return captcha()(req, res, next);
    }
    return next();
};

const registerCaptcha = (req, res, next) => {
    if ((process.env.CAPTCHA_REGISTER_ENABLED || "false").toLowerCase() === "true") {
        return captcha()(req, res, next);
    }
    return next();
};

const router = express.Router();

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       201:
 *         description: User registered
 *
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Logged in successfully
 *       401:
 *         description: Invalid credentials
 *
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout current user
 *     responses:
 *       200:
 *         description: Logged out
 *       401:
 *         description: Not authorized
 *
 * /api/auth/profile:
 *   get:
 *     tags: [Auth]
 *     summary: Get current user profile
 *     responses:
 *       200:
 *         description: Current user profile
 *       401:
 *         description: Not authorized
 *
 *   put:
 *     tags: [Auth]
 *     summary: Update current user profile (name and/or password)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               currentPassword:
 *                 type: string
 *                 format: password
 *               newPassword:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Profile updated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authorized
 *
 * /api/auth/verify-email:
 *   post:
 *     tags: [Auth]
 *     summary: Verify email with token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, email]
 *             properties:
 *               token:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Email verified
 *       400:
 *         description: Invalid or expired token
 *
 * /api/auth/resend-verification:
 *   post:
 *     tags: [Auth]
 *     summary: Resend verification email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Verification email sent
 *
 * /api/auth/google:
 *   post:
 *     tags: [Auth]
 *     summary: Google Sign-In using ID token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [idToken]
 *             properties:
 *               idToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Logged in successfully
 *       401:
 *         description: Invalid Google token
 *
 * /api/auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Send a password reset link if the account exists and is verified
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: If the email exists, a reset link has been sent
 *
 * /api/auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Reset password using token sent via email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, email, newPassword]
 *             properties:
 *               token:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               newPassword:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Password has been reset
 *       400:
 *         description: Invalid or expired token
 */

// Public
router.post("/register", registerLimiter, registerCaptcha, validate(RegisterSchema), registerUser);
router.post("/login", loginLimiter, loginAttemptCheck, loginCaptcha, validate(LoginSchema), loginUser);
router.post("/verify-email", verifyEmailLimiter, validate(VerifyEmailSchema), verifyEmail);
router.post("/resend-verification", resendVerificationLimiter, validate(ResendVerificationSchema), resendVerification);
router.post("/google", googleLoginLimiter, validate(GoogleIdTokenSchema), googleSignIn);
router.post("/forgot-password", forgotPasswordLimiter, captcha(), validate(ForgotPasswordSchema), forgotPassword);
router.post("/reset-password", resetPasswordLimiter, captcha(), validate(ResetPasswordSchema), resetPassword);

// Token refresh (uses httpOnly cookie — no auth middleware needed)
router.post("/refresh", refreshAccessToken);

// Protected
router.post("/logout", protect, logoutUser);
router.get("/profile", protect, (req, res) => {
    const { _id, name, email, role, provider, preferredProgrammingLanguage, interviewerVoicePreference, practiceGoal, targetRole, weeklyPracticeTarget, reminderEnabled, reminderDay, reminderTime, reminderTimezone, practicePlan, practiceSubscriptionStatus, isVerified } = req.user;
    res.json({ _id, name, email, role, provider, preferredProgrammingLanguage, interviewerVoicePreference: interviewerVoicePreference || "random", practiceGoal, targetRole, weeklyPracticeTarget, reminderEnabled, reminderDay, reminderTime, reminderTimezone, practicePlan, practiceSubscriptionStatus, isVerified });
});
router.put("/profile", protect, validate(UpdateProfileSchema), audit("account.profile_update", { entityType: "User", getEntityId: (req) => req.user._id, pickBody: (body) => ({ nameChanged: body.name !== undefined, passwordChanged: Boolean(body.newPassword), goalChanged: body.practiceGoal !== undefined || body.targetRole !== undefined, reminderChanged: ["reminderEnabled", "reminderDay", "reminderTime", "reminderTimezone"].some((key) => body[key] !== undefined) }) }), updateProfile);
router.post("/reminders/test", protect, requireRole("admin"), audit("account.reminder_test", { entityType: "User", getEntityId: (req) => req.user._id }), async (req, res, next) => {
    try {
        await sendTestPracticeReminder(req.user);
        return res.json({ message: "Test reminder sent" });
    } catch (error) { return next(error); }
});
router.get("/reminders/deliveries", protect, async (req, res, next) => {
    try {
        const items = await ReminderDelivery.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(10).select("reminderKey scheduledFor status attempts sentAt lastError").lean();
        return res.json({ items });
    } catch (error) { return next(error); }
});
router.get("/export", protect, requireFeature("ACCOUNT_DATA_EXPORT_ENABLED"), async (req, res, next) => {
    try {
        const userId = req.user._id;
        const [profile, interviews, resumes, resumeReviews, savedExperiences, productFeedback, reminderDeliveries, productEvents] = await Promise.all([
            User.findById(userId).select("name email role provider preferredProgrammingLanguage interviewerVoicePreference practiceGoal targetRole weeklyPracticeTarget reminderEnabled reminderDay reminderTime reminderTimezone practicePlan practiceSubscriptionStatus isVerified createdAt updatedAt").lean(),
            Interview.find({ user: userId }).lean(),
            Resume.find({ user: userId }).select("-cloudinaryUrl -secureUrl").lean(),
            ResumeReview.find({ user: userId }).lean(),
            SavedExperience.find({ user: userId }).lean(),
            ProductFeedback.find({ user: userId }).lean(),
            ReminderDelivery.find({ user: userId }).lean(),
            ProductEvent.find({ user: userId }).lean(),
        ]);
        res.setHeader("Content-Disposition", `attachment; filename="evalcue-export-${new Date().toISOString().slice(0, 10)}.json"`);
        return res.json({ exportedAt: new Date().toISOString(), profile, interviews, resumes, resumeReviews, savedExperiences, productFeedback, reminderDeliveries, productEvents });
    } catch (error) { return next(error); }
});
router.delete(
    "/profile",
    protect,
    validate(z.object({ confirmation: z.literal("DELETE"), password: z.string().max(128).optional() })),
    deleteAccount
);

export default router;
