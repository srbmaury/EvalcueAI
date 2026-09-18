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

const enabled = (name) => String(process.env[name] || "").toLowerCase() === "true";
const loginCaptcha = (req, res, next) => enabled("CAPTCHA_LOGIN_ENABLED") ? captcha()(req, res, next) : next();
const registerCaptcha = (req, res, next) => enabled("CAPTCHA_REGISTER_ENABLED") ? captcha()(req, res, next) : next();

const router = express.Router();

// Browser-safe runtime configuration. Secrets are intentionally never exposed.
router.get("/public-config", (_req, res) => {
    const provider = String(process.env.CAPTCHA_PROVIDER || "turnstile").toLowerCase() === "recaptcha" ? "recaptcha" : "turnstile";
    const captchaEnabled = process.env.NODE_ENV === "production" && enabled("CAPTCHA_ENABLED");
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
    return res.json({
        google: { enabled: Boolean(process.env.GOOGLE_CLIENT_ID), clientId: process.env.GOOGLE_CLIENT_ID || "" },
        captcha: {
            enabled: captchaEnabled,
            provider,
            siteKey: captchaEnabled ? (process.env.CAPTCHA_SITE_KEY || "") : "",
            loginEnabled: captchaEnabled && enabled("CAPTCHA_LOGIN_ENABLED"),
            registerEnabled: captchaEnabled && enabled("CAPTCHA_REGISTER_ENABLED"),
            candidateStartEnabled: captchaEnabled,
        },
        features: {
            accountDataExport: enabled("ACCOUNT_DATA_EXPORT_ENABLED"),
            codeExecution: enabled("ENABLE_CODE_EXEC"),
            transcription: enabled("ENABLE_STT"),
        },
    });
});

// Public authentication endpoints.
router.post("/register", registerLimiter, registerCaptcha, validate(RegisterSchema), registerUser);
router.post("/login", loginLimiter, loginAttemptCheck, loginCaptcha, validate(LoginSchema), loginUser);
router.post("/verify-email", verifyEmailLimiter, validate(VerifyEmailSchema), verifyEmail);
router.post("/resend-verification", resendVerificationLimiter, validate(ResendVerificationSchema), resendVerification);
router.post("/google", googleLoginLimiter, validate(GoogleIdTokenSchema), googleSignIn);
router.post("/forgot-password", forgotPasswordLimiter, captcha(), validate(ForgotPasswordSchema), forgotPassword);
router.post("/reset-password", resetPasswordLimiter, captcha(), validate(ResetPasswordSchema), resetPassword);
router.post("/refresh", refreshAccessToken);

// Protected account endpoints.
router.post("/logout", protect, logoutUser);
router.get("/profile", protect, (req, res) => {
    const { _id, name, email, role, provider, preferredProgrammingLanguage, interviewerVoicePreference, practiceGoal, targetRole, weeklyPracticeTarget, reminderEnabled, reminderDay, reminderTime, reminderTimezone, practicePlan, practiceSubscriptionStatus, isVerified } = req.user;
    return res.json({ _id, name, email, role, provider, preferredProgrammingLanguage, interviewerVoicePreference: interviewerVoicePreference || "random", practiceGoal, targetRole, weeklyPracticeTarget, reminderEnabled, reminderDay, reminderTime, reminderTimezone, practicePlan, practiceSubscriptionStatus, isVerified });
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
router.delete("/profile", protect, validate(z.object({ confirmation: z.literal("DELETE"), password: z.string().max(128).optional() })), deleteAccount);

export default router;
