import crypto from "crypto";
import mongoose from "mongoose";
import User from "../models/User.js";
import { bumpTokenVersion, signAccessToken, issueRefreshToken, validateRefreshToken, revokeRefreshToken, revokeAllRefreshTokens } from "../utils/tokens.js";
import { OAuth2Client } from "google-auth-library";
import metrics from "../metrics/index.js";
import { sendMail, buildVerificationEmail } from "../utils/mailer.js";
import bcrypt from "bcryptjs";
import { recordLoginFailure, clearLoginFailures } from "../middleware/loginLockout.js";
import AuditLog from "../models/AuditLog.js";
import Interview from "../models/Interview.js";
import Resume from "../models/Resume.js";
import Round from "../models/Round.js";
import Question from "../models/Question.js";
import Feedback from "../models/Feedback.js";
import RefreshToken from "../models/RefreshToken.js";
import ResumeReview from "../models/ResumeReview.js";
import SavedExperience from "../models/SavedExperience.js";
import ProductFeedback from "../models/ProductFeedback.js";
import PracticeUsageCounter from "../models/PracticeUsageCounter.js";
import { hiringClientOrigin, practiceClientOrigin } from "../config/clientOrigins.js";
import ReminderDelivery from "../models/ReminderDelivery.js";
import ProductEvent from "../models/ProductEvent.js";
import Assessment from "../models/Assessment.js";
import CandidateAttempt from "../models/CandidateAttempt.js";
import Organization from "../models/Organization.js";
import OrganizationMembership from "../models/OrganizationMembership.js";
import cloudinary from "../config/cloudinaryConfig.js";

const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 7);

const refreshCookieOptions = () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.COOKIE_SAMESITE || (process.env.NODE_ENV === "production" ? "strict" : "lax"),
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: "/api/auth",
});

const setRefreshCookie = (res, raw, expiresAt) => {
    res.cookie("refreshToken", raw, {
        ...refreshCookieOptions(),
        expires: expiresAt,
    });
};

const clearRefreshCookie = (res) => {
    res.clearCookie("refreshToken", refreshCookieOptions());
};

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const safeUserFields = "_id name email role provider preferredProgrammingLanguage practiceGoal targetRole weeklyPracticeTarget reminderEnabled reminderDay reminderTime reminderTimezone practicePlan practiceSubscriptionStatus isVerified";
const resetWorkspaceFor = (value) => value === "hiring" ? "hiring" : "practice";
const clientOriginForWorkspace = (workspace) => resetWorkspaceFor(workspace) === "hiring" ? hiringClientOrigin() : practiceClientOrigin();

// Register
export const registerUser = async (req, res, next) => {
    const { name, email, password } = req.body;

    try {
        const userExists = await User.findOne({ email });
        if (userExists)
            return res.status(400).json({ message: "User already exists" });

        const verificationTokenRaw = crypto.randomBytes(32).toString("hex");
        const verificationTokenHashed = crypto.createHash("sha256").update(verificationTokenRaw).digest("hex");
        const verificationTokenExpires = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24h

        const user = await User.create({
            name,
            email,
            password,
            isVerified: false,
            verificationToken: verificationTokenHashed,
            verificationTokenExpires,
        });

        if (user) {
            const baseUrl = practiceClientOrigin();
            const verifyUrl = `${baseUrl}/verify-email?token=${verificationTokenRaw}&email=${encodeURIComponent(email)}`;
            const mail = buildVerificationEmail(user.name || "there", verifyUrl);
            if (process.env.NODE_ENV === "development") {
                console.log(`\n[DEV] Verification URL for ${email}:\n  ${verifyUrl}\n`);
            }
            try {
                await sendMail({ to: email, ...mail });
            } catch (e) {
                // Non-fatal: still allow account creation
                console.warn("Email send failed:", e?.message || e);
            }

            try { metrics.authRegisterTotal.labels("success").inc(); } catch {}
            res.status(201).json({
                message: "Registered. Please verify your email to log in.",
            });
        } else {
            try { metrics.authRegisterTotal.labels("failure").inc(); } catch {}
            res.status(400).json({ message: "Invalid user data" });
        }
    } catch (error) {
        try { metrics.authRegisterTotal.labels("failure").inc(); } catch {}
        return next(error instanceof Error ? error : new Error(String(error)));
    }
};

// Login
export const loginUser = async (req, res, next) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            await recordLoginFailure((email || "").toLowerCase());
            try { metrics.authLoginAttemptsTotal.labels("local", "failure").inc(); } catch {}
            return res.status(401).json({ message: "Invalid email or password" });
        }
        if (user.provider !== "local") {
            await recordLoginFailure((email || "").toLowerCase());
            return res.status(400).json({ message: user.provider === "sso" ? "Use work SSO for this account" : "Use Google Sign-In for this account" });
        }
        if (!(await user.matchPassword(password))) {
            await recordLoginFailure((email || "").toLowerCase());
            try { metrics.authLoginAttemptsTotal.labels("local", "failure").inc(); } catch {}
            return res.status(401).json({ message: "Invalid email or password" });
        }
        if (!user.isVerified) {
            await recordLoginFailure((email || "").toLowerCase());
            try { metrics.authLoginAttemptsTotal.labels("local", "blocked").inc(); } catch {}
            return res.status(403).json({ message: "Email not verified" });
        }
        const token = signAccessToken(user._id, user.tokenVersion);
        const { raw, expiresAt } = await issueRefreshToken(user._id, { userAgent: req.get("user-agent"), ip: req.ip });
        setRefreshCookie(res, raw, expiresAt);
        res.json({ token, user: { _id: user._id, name: user.name, email: user.email } });
        try { await clearLoginFailures((email || "").toLowerCase()); } catch {}
        try { metrics.authLoginAttemptsTotal.labels("local", "success").inc(); } catch {}
        try { await AuditLog.create({ user: user._id, action: "auth.login", ip: req.ip, userAgent: req.get("user-agent"), requestId: req.id }); } catch {}
    } catch (error) {
        return next(error instanceof Error ? error : new Error(String(error)));
    }
};

// Logout
export const logoutUser = async (req, res, next) => {
    try {
        const raw = req.cookies?.refreshToken;
        if (raw) await revokeRefreshToken(raw);
    } catch {}
    clearRefreshCookie(res);
    res.status(200).json({ message: "Logged out successfully" });
    try { metrics.authLogoutTotal.inc(); } catch {}
    try { AuditLog.create({ user: req.user?._id, action: "auth.logout", ip: req.ip, userAgent: req.get("user-agent"), requestId: req.id }).catch(() => {}); } catch {}
};

// Refresh access token using httpOnly refresh cookie
export const refreshAccessToken = async (req, res, next) => {
    const raw = req.cookies?.refreshToken;
    if (!raw) return res.status(401).json({ message: "No refresh token" });
    try {
        const userId = await validateRefreshToken(raw);
        if (!userId) {
            clearRefreshCookie(res);
            return res.status(401).json({ message: "Refresh token invalid or expired" });
        }
        const user = await User.findById(userId).select("tokenVersion name email");
        if (!user) {
            clearRefreshCookie(res);
            return res.status(401).json({ message: "User not found" });
        }
        // Keep this browser's refresh session stable so reloads and concurrent
        // tabs do not invalidate this or other signed-in devices.
        const token = signAccessToken(user._id, user.tokenVersion);
        return res.json({ token });
    } catch (err) {
        return next(err instanceof Error ? err : new Error(String(err)));
    }
};
// Verify email
export const verifyEmail = async (req, res, next) => {
    const { token, email } = req.body;
    try {
        const hashed = crypto.createHash("sha256").update(token).digest("hex");
        const user = await User.findOne({ email, verificationToken: hashed });
        if (!user) return res.status(400).json({ message: "Invalid token" });
        if (user.verificationTokenExpires && user.verificationTokenExpires < new Date()) {
            return res.status(400).json({ message: "Token expired" });
        }
        user.isVerified = true;
        user.verificationToken = undefined;
        user.verificationTokenExpires = undefined;
        await user.save();
        try { metrics.authVerifyTotal.labels("verify", "success").inc(); } catch {}
        return res.json({ message: "Email verified. You can now log in." });
    } catch (err) {
        try { metrics.authVerifyTotal.labels("verify", "failure").inc(); } catch {}
        return next(err instanceof Error ? err : new Error(String(err)));
    }
};

// Resend verification
export const resendVerification = async (req, res, next) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email });
        if (user && !user.isVerified) {
            const verificationToken = crypto.randomBytes(32).toString("hex");
            user.verificationToken = crypto.createHash("sha256").update(verificationToken).digest("hex");
            user.verificationTokenExpires = new Date(Date.now() + 1000 * 60 * 60 * 24);
            await user.save();

            const baseUrl = practiceClientOrigin();
            const verifyUrl = `${baseUrl}/verify-email?token=${verificationToken}&email=${encodeURIComponent(email)}`;
            const mail = buildVerificationEmail(user.name || "there", verifyUrl);
            if (process.env.NODE_ENV === "development") {
                console.log(`\n[DEV] Resend verification URL for ${email}:\n  ${verifyUrl}\n`);
            }
            try {
                await sendMail({ to: email, ...mail });
            } catch (e) {
                console.warn("Resend email failed:", e?.message || e);
            }
        }
        try { metrics.authVerifyTotal.labels("resend", "success").inc(); } catch {}
        return res.json({ message: "If the email exists, a verification email has been sent" });
    } catch (err) {
        try { metrics.authVerifyTotal.labels("resend", "failure").inc(); } catch {}
        return next(err instanceof Error ? err : new Error(String(err)));
    }
};

// Google Sign-In with ID token
export const googleSignIn = async (req, res, next) => {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ message: "Missing idToken" });
    try {
        const ticket = await googleClient.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const email = payload?.email;
        const name = payload?.name || email?.split("@")[0] || "User";
        const googleId = payload?.sub;
        if (!email || payload?.email_verified !== true) {
            return res.status(401).json({ message: "Google email is not verified" });
        }

        let user = await User.findOne({ email });
        if (!user) {
            user = await User.create({
                name,
                email,
                provider: "google",
                googleId,
                isVerified: true,
            });
        } else {
            if (!user.isVerified) {
                user.isVerified = true; // trust Google verified email
            }
            if (!user.googleId) user.googleId = googleId;
            await user.save();
        }

        const token = signAccessToken(user._id, user.tokenVersion);
        const { raw, expiresAt } = await issueRefreshToken(user._id, { userAgent: req.get("user-agent"), ip: req.ip });
        setRefreshCookie(res, raw, expiresAt);
        try { metrics.authLoginAttemptsTotal.labels("google", "success").inc(); } catch {}
        return res.json({ token, user: { _id: user._id, name: user.name, email: user.email } });
    } catch (err) {
        try { metrics.authLoginAttemptsTotal.labels("google", "failure").inc(); } catch {}
        return res.status(401).json({ message: "Invalid Google token" });
    }
};

// Update profile (name and/or password)
export const updateProfile = async (req, res, next) => {
    try {
        const { name, currentPassword, newPassword, preferredProgrammingLanguage, practiceGoal, targetRole, weeklyPracticeTarget, reminderEnabled, reminderDay, reminderTime, reminderTimezone } = req.body || {};

        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: "User not found" });

        if (typeof name === "string" && name.trim()) {
            user.name = name.trim();
        }

        if (newPassword) {
            if (user.provider !== "local") {
                return res.status(400).json({ message: "Password changes are only available for email/password accounts" });
            }
            if (!currentPassword) {
                return res.status(400).json({ message: "Current password is required" });
            }
            const matches = await user.matchPassword(currentPassword);
            if (!matches) {
                return res.status(400).json({ message: "Current password is incorrect" });
            }
            user.password = newPassword;
        }

        if (typeof preferredProgrammingLanguage === "string" && preferredProgrammingLanguage.trim()) {
            user.preferredProgrammingLanguage = preferredProgrammingLanguage.trim();
        }
        if (practiceGoal !== undefined) user.practiceGoal = practiceGoal;
        if (targetRole !== undefined) user.targetRole = targetRole.trim();
        if (weeklyPracticeTarget !== undefined) user.weeklyPracticeTarget = weeklyPracticeTarget;
        if (reminderEnabled !== undefined) user.reminderEnabled = reminderEnabled;
        if (reminderDay !== undefined) user.reminderDay = reminderDay;
        if (reminderTime !== undefined) user.reminderTime = reminderTime;
        if (reminderTimezone !== undefined) user.reminderTimezone = reminderTimezone;

        await user.save();
        let token;
        if (newPassword) {
            try { metrics.securityPasswordChangeTotal.labels("success").inc(); } catch {}
            await bumpTokenVersion(user._id);
            await revokeAllRefreshTokens(user._id);
            const fresh = await User.findById(user._id).select("tokenVersion");
            token = signAccessToken(user._id, fresh?.tokenVersion);
            const { raw, expiresAt } = await issueRefreshToken(user._id, { userAgent: req.get("user-agent"), ip: req.ip });
            setRefreshCookie(res, raw, expiresAt);
        }
        const safe = await User.findById(user._id).select(safeUserFields).lean();
        return res.json({ message: "Profile updated", ...(token ? { token } : {}), user: safe });
    } catch (err) {
        if (req.body?.newPassword) {
            try { metrics.securityPasswordChangeTotal.labels("failure").inc(); } catch {}
        }
        return next(err instanceof Error ? err : new Error(String(err)));
    }
};

export const deleteAccount = async (req, res, next) => {
    try {
        const { confirmation, password } = req.body || {};
        if (confirmation !== "DELETE") return res.status(400).json({ message: "Type DELETE to confirm" });
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: "User not found" });
        if (user.provider === "local" && (!password || !await user.matchPassword(password))) {
            return res.status(400).json({ message: "Current password is incorrect" });
        }
        if (["active", "trialing"].includes(user.practiceSubscriptionStatus)) {
            return res.status(409).json({ message: "Cancel your active Practice subscription before deleting your account" });
        }

        const interviews = await Interview.find({ user: user._id }).select("rounds.round").lean();
        const roundIds = interviews.flatMap((item) => (item.rounds || []).map((entry) => entry.round));
        const rounds = await Round.find({ _id: { $in: roundIds } }).select("questions.question questions.feedback").lean();
        const questionIds = rounds.flatMap((round) => (round.questions || []).map((item) => item.question).filter(Boolean));
        const feedbackIds = rounds.flatMap((round) => (round.questions || []).map((item) => item.feedback).filter(Boolean));
        const resumes = await Resume.find({ user: user._id }).select("publicId").lean();
        const sharedQuestionIds = await Round.distinct("questions.question", { _id: { $nin: roundIds }, "questions.question": { $in: questionIds } });
        const sharedSet = new Set(sharedQuestionIds.map(String));
        const privateQuestionIds = questionIds.filter((id) => !sharedSet.has(String(id)));
        const ownedMemberships = await OrganizationMembership.find({ user: user._id, role: "owner", status: "active" }).select("organization").lean();
        const ownedOrganizationIds = ownedMemberships.map((membership) => membership.organization);
        const ownedOrganizations = ownedOrganizationIds.length
            ? await Organization.find({ _id: { $in: ownedOrganizationIds } }).select("_id hiringSubscriptionStatus").lean()
            : [];
        if (ownedOrganizations.some((organization) => ["active", "trialing"].includes(organization.hiringSubscriptionStatus))) {
            return res.status(409).json({ message: "Cancel Hiring billing or transfer organization ownership before deleting your account" });
        }
        for (const organizationId of ownedOrganizationIds) {
            const activeMembers = await OrganizationMembership.countDocuments({ organization: organizationId, status: "active" });
            if (activeMembers > 1) {
                return res.status(409).json({ message: "Transfer ownership of your hiring organization before deleting your account" });
            }
        }
        const assessmentIds = ownedOrganizationIds.length
            ? await Assessment.distinct("_id", { organization: { $in: ownedOrganizationIds } })
            : [];

        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                await Feedback.deleteMany({ $or: [{ user: user._id }, { _id: { $in: feedbackIds } }] }, { session });
                await Question.deleteMany({ _id: { $in: privateQuestionIds } }, { session });
                await Round.deleteMany({ _id: { $in: roundIds } }, { session });
                await Interview.deleteMany({ user: user._id }, { session });
                await Resume.deleteMany({ user: user._id }, { session });
                await ResumeReview.deleteMany({ user: user._id }, { session });
                await SavedExperience.deleteMany({ user: user._id }, { session });
                await ProductFeedback.deleteMany({ user: user._id }, { session });
                await PracticeUsageCounter.deleteMany({ user: user._id }, { session });
                await ReminderDelivery.deleteMany({ user: user._id }, { session });
                await ProductEvent.deleteMany({ user: user._id }, { session });
                await CandidateAttempt.deleteMany({ assessment: { $in: assessmentIds } }, { session });
                await Assessment.deleteMany({ organization: { $in: ownedOrganizationIds } }, { session });
                await OrganizationMembership.deleteMany({ $or: [{ user: user._id }, { organization: { $in: ownedOrganizationIds } }] }, { session });
                await Organization.deleteMany({ _id: { $in: ownedOrganizationIds } }, { session });
                await RefreshToken.deleteMany({ user: user._id }, { session });
                await AuditLog.deleteMany({ user: user._id }, { session });
                await User.deleteOne({ _id: user._id }, { session });
            });
        } finally {
            await session.endSession();
        }
        clearRefreshCookie(res);

        const publicIds = resumes.map((resume) => resume.publicId).filter(Boolean);
        if (publicIds.length && process.env.NODE_ENV !== "test") {
            cloudinary.api.delete_resources(publicIds, { resource_type: "raw" }).catch((error) => {
                console.warn("Account Cloudinary cleanup failed:", error?.message || error);
            });
        }
        return res.json({ message: "Account and personal data deleted" });
    } catch (error) {
        return next(error instanceof Error ? error : new Error(String(error)));
    }
};

export const forgotPassword = async (req, res, next) => {
    const { email, workspace } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.json({ message: "If the email exists, a reset link has been sent" });
        if (!user.isVerified) return res.json({ message: "If the email exists, a reset link has been sent" });
        if (user.provider !== "local") return res.json({ message: "If the email exists, a reset link has been sent" });

        const token = crypto.randomBytes(32).toString("hex");
        user.resetPasswordToken = crypto.createHash("sha256").update(token).digest("hex");
        user.resetPasswordExpires = new Date(Date.now() + 1000 * 60 * 30); // 30 min
        await user.save();

        const resetWorkspace = resetWorkspaceFor(workspace);
        const baseUrl = clientOriginForWorkspace(resetWorkspace);
        const resetUrl = `${baseUrl}/reset-password?token=${token}&email=${encodeURIComponent(email)}&workspace=${resetWorkspace}`;
        const subject = "Reset your password";
        const html = `
            <div style="font-family: Arial, sans-serif; line-height:1.5;">
                <h2>Reset your password</h2>
                <p>We received a request to reset your password. Click the button below to proceed.</p>
                <p><a href="${resetUrl}" style="display:inline-block;padding:10px 16px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:6px;">Reset Password</a></p>
                <p>Or open this link: <a href="${resetUrl}">${resetUrl}</a></p>
                <p>If you did not request this, you can ignore this email.</p>
            </div>
        `;
        try {
            await sendMail({ to: email, subject, html, text: undefined });
        } catch (e) {
            console.warn("Reset email send failed:", e?.message || e);
        }
        try { metrics.authResetTotal.labels("forgot", "success").inc(); } catch {}
        try { await AuditLog.create({ user: user?._id, action: "auth.forgot", ip: req.ip, userAgent: req.get("user-agent"), requestId: req.id }); } catch {}
        return res.json({ message: "If the email exists, a reset link has been sent" });
    } catch (err) {
        try { metrics.authResetTotal.labels("forgot", "failure").inc(); } catch {}
        return next(err instanceof Error ? err : new Error(String(err)));
    }
};

export const resetPassword = async (req, res, next) => {
    const { token, email, newPassword, workspace } = req.body;
    const resetWorkspace = resetWorkspaceFor(workspace);
    try {
        const hashed = crypto.createHash("sha256").update(token).digest("hex");
        const user = await User.findOne({ email, resetPasswordToken: hashed });
        if (!user) return res.status(400).json({ message: "Invalid token" });
        if (!user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
            return res.status(400).json({ message: "Token expired" });
        }
        if (user.provider !== "local") {
            return res.status(400).json({ message: "Password reset is only available for email/password accounts" });
        }
        user.password = newPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();
        await bumpTokenVersion(user._id);
        await revokeAllRefreshTokens(user._id);
        try { metrics.authResetTotal.labels("reset", "success").inc(); } catch {}
        try { await AuditLog.create({ user: user._id, action: "auth.reset", ip: req.ip, userAgent: req.get("user-agent"), requestId: req.id }); } catch {}
        return res.json({ message: "Password has been reset" });
    } catch (err) {
        try { metrics.authResetTotal.labels("reset", "failure").inc(); } catch {}
        return next(err instanceof Error ? err : new Error(String(err)));
    }
};
