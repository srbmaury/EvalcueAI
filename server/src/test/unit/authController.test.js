import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    findOne: vi.fn(), findById: vi.fn(), createUser: vi.fn(),
    signAccessToken: vi.fn(), issueRefreshToken: vi.fn(), validateRefreshToken: vi.fn(),
    revokeRefreshToken: vi.fn(), revokeAllRefreshTokens: vi.fn(), bumpTokenVersion: vi.fn(),
    recordLoginFailure: vi.fn(), clearLoginFailures: vi.fn(), auditCreate: vi.fn(), metricInc: vi.fn(), sendMail: vi.fn(),
}));

vi.mock("../../models/User.js", () => ({ default: { findOne: mocks.findOne, findById: mocks.findById, create: mocks.createUser } }));
// setRefreshCookie/refreshCookieOptions are pure aside from res.cookie (already a test
// double via response()), so keep the real implementations via importOriginal and only
// mock the functions with real side effects (DB/crypto).
vi.mock("../../utils/tokens.js", async (importOriginal) => ({
    ...(await importOriginal()),
    signAccessToken: mocks.signAccessToken,
    issueRefreshToken: mocks.issueRefreshToken,
    validateRefreshToken: mocks.validateRefreshToken,
    revokeRefreshToken: mocks.revokeRefreshToken,
    revokeAllRefreshTokens: mocks.revokeAllRefreshTokens,
    bumpTokenVersion: mocks.bumpTokenVersion,
}));
vi.mock("../../middleware/loginLockout.js", () => ({ recordLoginFailure: mocks.recordLoginFailure, clearLoginFailures: mocks.clearLoginFailures }));
vi.mock("../../models/AuditLog.js", () => ({ default: { create: mocks.auditCreate, deleteMany: vi.fn() } }));
vi.mock("../../metrics/index.js", () => ({ default: new Proxy({}, { get: () => ({ labels: () => ({ inc: mocks.metricInc }), inc: mocks.metricInc }) }) }));
vi.mock("../../utils/mailer.js", () => ({ sendMail: mocks.sendMail, buildVerificationEmail: vi.fn(() => ({ subject: "Verify", html: "body" })) }));
vi.mock("../../config/clientOrigins.js", () => ({ practiceClientOrigin: () => "https://practice.example.com" }));
vi.mock("../../config/cloudinaryConfig.js", () => ({ default: { api: { delete_resources: vi.fn() } } }));

import { deleteAccount, forgotPassword, loginUser, logoutUser, refreshAccessToken, registerUser, resendVerification, resetPassword, updateProfile, verifyEmail } from "../../controllers/authController.js";

const response = () => ({
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    cookie: vi.fn(),
    clearCookie: vi.fn(),
});
const request = (overrides = {}) => ({
    body: {}, cookies: {}, ip: "203.0.113.5", id: "request-1",
    get: (name) => name === "user-agent" ? "Test Browser" : undefined,
    ...overrides,
});

describe("authentication controller", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.signAccessToken.mockReturnValue("access-token");
        mocks.issueRefreshToken.mockResolvedValue({ raw: "refresh-token", expiresAt: new Date("2030-01-01T00:00:00Z") });
        mocks.auditCreate.mockResolvedValue({});
        mocks.recordLoginFailure.mockResolvedValue(undefined);
        mocks.clearLoginFailures.mockResolvedValue(undefined);
        mocks.sendMail.mockResolvedValue(undefined);
    });

    it("registers a local account and sends a verification message", async () => {
        mocks.findOne.mockResolvedValueOnce(null);
        mocks.createUser.mockResolvedValueOnce({ _id: "user-new", name: "New User" });
        const res = response();
        await registerUser(request({ body: { name: "New User", email: "new@example.com", password: "secret" } }), res, vi.fn());
        expect(mocks.createUser).toHaveBeenCalledWith(expect.objectContaining({
            name: "New User", email: "new@example.com", password: "secret", isVerified: false,
            verificationToken: expect.any(String), verificationTokenExpires: expect.any(Date),
        }));
        expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "new@example.com", subject: "Verify" }));
        expect(res.status).toHaveBeenCalledWith(201);

        mocks.findOne.mockResolvedValueOnce({ _id: "existing" });
        const duplicate = response();
        await registerUser(request({ body: { name: "User", email: "new@example.com", password: "secret" } }), duplicate, vi.fn());
        expect(duplicate.status).toHaveBeenCalledWith(400);
        expect(duplicate.json).toHaveBeenCalledWith({ message: "User already exists" });
    });

    it("does not reveal whether a local account exists during failed login", async () => {
        mocks.findOne.mockResolvedValueOnce(null);
        const missing = response();
        await loginUser(request({ body: { email: "MISSING@example.com", password: "bad" } }), missing, vi.fn());
        expect(missing.status).toHaveBeenCalledWith(401);
        expect(missing.json).toHaveBeenCalledWith({ message: "Invalid email or password" });
        expect(mocks.recordLoginFailure).toHaveBeenCalledWith("missing@example.com");

        const user = { provider: "local", matchPassword: vi.fn().mockResolvedValue(false) };
        mocks.findOne.mockResolvedValueOnce(user);
        const wrong = response();
        await loginUser(request({ body: { email: "USER@example.com", password: "bad" } }), wrong, vi.fn());
        expect(wrong.status).toHaveBeenCalledWith(401);
        expect(wrong.json).toHaveBeenCalledWith({ message: "Invalid email or password" });
        expect(mocks.recordLoginFailure).toHaveBeenCalledWith("user@example.com");
    });

    it("gives federated-provider accounts the same generic failure as a bad password, to avoid leaking which accounts exist or how they authenticate", async () => {
        mocks.findOne.mockResolvedValueOnce({ provider: "google" });
        const google = response();
        await loginUser(request({ body: { email: "google@example.com", password: "x" } }), google, vi.fn());
        expect(google.status).toHaveBeenCalledWith(401);
        expect(google.json).toHaveBeenCalledWith({ message: "Invalid email or password" });

        mocks.findOne.mockResolvedValueOnce({ provider: "sso" });
        const sso = response();
        await loginUser(request({ body: { email: "sso@example.com", password: "x" } }), sso, vi.fn());
        expect(sso.status).toHaveBeenCalledWith(401);
        expect(sso.json).toHaveBeenCalledWith({ message: "Invalid email or password" });
    });

    it("blocks unverified local users", async () => {
        mocks.findOne.mockResolvedValueOnce({ provider: "local", isVerified: false, matchPassword: vi.fn().mockResolvedValue(true) });
        const unverified = response();
        await loginUser(request({ body: { email: "pending@example.com", password: "x" } }), unverified, vi.fn());
        expect(unverified.status).toHaveBeenCalledWith(403);
        expect(unverified.json).toHaveBeenCalledWith({ message: "Email not verified" });
    });

    it("creates a refresh session and audit event after successful login", async () => {
        const user = { _id: "user-1", name: "Alice", email: "alice@example.com", provider: "local", isVerified: true, tokenVersion: 2, matchPassword: vi.fn().mockResolvedValue(true) };
        mocks.findOne.mockResolvedValueOnce(user);
        const res = response();
        await loginUser(request({ body: { email: user.email, password: "correct" } }), res, vi.fn());
        expect(mocks.signAccessToken).toHaveBeenCalledWith("user-1", 2);
        expect(mocks.issueRefreshToken).toHaveBeenCalledWith("user-1", { userAgent: "Test Browser", ip: "203.0.113.5" });
        expect(res.cookie).toHaveBeenCalledWith("refreshToken", "refresh-token", expect.objectContaining({ httpOnly: true, path: "/api/auth" }));
        expect(res.json).toHaveBeenCalledWith({ token: "access-token", user: { _id: "user-1", name: "Alice", email: "alice@example.com" } });
        expect(mocks.clearLoginFailures).toHaveBeenCalledWith("alice@example.com");
        expect(mocks.auditCreate).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.login" }));
    });

    it("revokes the current refresh session on logout", async () => {
        const res = response();
        await logoutUser(request({ cookies: { refreshToken: "raw-token" }, user: { _id: "user-1" } }), res, vi.fn());
        expect(mocks.revokeRefreshToken).toHaveBeenCalledWith("raw-token");
        expect(res.clearCookie).toHaveBeenCalledWith("refreshToken", expect.objectContaining({ path: "/api/auth" }));
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it("handles missing, expired, and valid refresh sessions", async () => {
        const missing = response();
        await refreshAccessToken(request(), missing, vi.fn());
        expect(missing.status).toHaveBeenCalledWith(401);

        mocks.validateRefreshToken.mockResolvedValueOnce(null);
        const expired = response();
        await refreshAccessToken(request({ cookies: { refreshToken: "expired" } }), expired, vi.fn());
        expect(expired.json).toHaveBeenCalledWith({ message: "Refresh token invalid or expired" });
        expect(expired.clearCookie).toHaveBeenCalled();

        mocks.validateRefreshToken.mockResolvedValueOnce("user-1");
        mocks.findById.mockReturnValueOnce({ select: vi.fn().mockResolvedValue({ _id: "user-1", tokenVersion: 4 }) });
        const valid = response();
        await refreshAccessToken(request({ cookies: { refreshToken: "valid" } }), valid, vi.fn());
        expect(mocks.signAccessToken).toHaveBeenCalledWith("user-1", 4);
        expect(valid.json).toHaveBeenCalledWith({ token: "access-token" });
    });

    it("verifies valid email tokens and rejects invalid or expired tokens", async () => {
        mocks.findOne.mockResolvedValueOnce(null);
        const invalid = response();
        await verifyEmail(request({ body: { email: "user@example.com", token: "bad" } }), invalid, vi.fn());
        expect(invalid.json).toHaveBeenCalledWith({ message: "Invalid token" });

        mocks.findOne.mockResolvedValueOnce({ verificationTokenExpires: new Date(Date.now() - 1000) });
        const expired = response();
        await verifyEmail(request({ body: { email: "user@example.com", token: "expired" } }), expired, vi.fn());
        expect(expired.json).toHaveBeenCalledWith({ message: "Token expired" });

        const user = { isVerified: false, verificationToken: "hash", verificationTokenExpires: new Date(Date.now() + 1000), save: vi.fn().mockResolvedValue(undefined) };
        mocks.findOne.mockResolvedValueOnce(user);
        const valid = response();
        await verifyEmail(request({ body: { email: "user@example.com", token: "valid" } }), valid, vi.fn());
        expect(user).toMatchObject({ isVerified: true, verificationToken: undefined, verificationTokenExpires: undefined });
        expect(user.save).toHaveBeenCalledOnce();
        expect(valid.json).toHaveBeenCalledWith({ message: "Email verified. You can now log in." });
    });

    it("resends verification only for an existing unverified account", async () => {
        const user = { name: "Pending", isVerified: false, save: vi.fn().mockResolvedValue(undefined) };
        mocks.findOne.mockResolvedValueOnce(user);
        const res = response();
        await resendVerification(request({ body: { email: "pending@example.com" } }), res, vi.fn());
        expect(user.verificationToken).toEqual(expect.any(String));
        expect(user.verificationTokenExpires).toBeInstanceOf(Date);
        expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "pending@example.com" }));
        expect(res.json).toHaveBeenCalledWith({ message: "If the email exists, a verification email has been sent" });

        mocks.findOne.mockResolvedValueOnce(null);
        await resendVerification(request({ body: { email: "missing@example.com" } }), response(), vi.fn());
        expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    });

    it("updates profile preferences without rotating sessions", async () => {
        const user = { _id: "user-1", provider: "local", save: vi.fn().mockResolvedValue(undefined) };
        const safe = { _id: "user-1", name: "Updated", targetRole: "Backend Engineer" };
        mocks.findById
            .mockResolvedValueOnce(user)
            .mockReturnValueOnce({ select: () => ({ lean: vi.fn().mockResolvedValue(safe) }) });
        const res = response();
        await updateProfile(request({ user: { _id: "user-1" }, body: {
            name: " Updated ", preferredProgrammingLanguage: " Java ", practiceGoal: "promotion",
            targetRole: " Backend Engineer ", weeklyPracticeTarget: 4, reminderEnabled: true,
            reminderDay: "monday", reminderTime: "09:00", reminderTimezone: "Asia/Kolkata",
        } }), res, vi.fn());
        expect(user).toMatchObject({ name: "Updated", preferredProgrammingLanguage: "Java", practiceGoal: "promotion", targetRole: "Backend Engineer", weeklyPracticeTarget: 4, reminderEnabled: true, reminderDay: "monday", reminderTime: "09:00", reminderTimezone: "Asia/Kolkata" });
        expect(user.save).toHaveBeenCalledOnce();
        expect(mocks.bumpTokenVersion).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({ message: "Profile updated", user: safe });
    });

    it("validates password changes before rotating all sessions", async () => {
        const oauthUser = { _id: "oauth", provider: "google" };
        mocks.findById.mockResolvedValueOnce(oauthUser);
        const oauth = response();
        await updateProfile(request({ user: { _id: "oauth" }, body: { newPassword: "NewPassword1!" } }), oauth, vi.fn());
        expect(oauth.json).toHaveBeenCalledWith({ message: "Password changes are only available for email/password accounts" });

        const user = { _id: "user-1", provider: "local", matchPassword: vi.fn().mockResolvedValue(true), save: vi.fn().mockResolvedValue(undefined) };
        const safe = { _id: "user-1", name: "Alice" };
        mocks.findById
            .mockResolvedValueOnce(user)
            .mockReturnValueOnce({ select: vi.fn().mockResolvedValue({ tokenVersion: 5 }) })
            .mockReturnValueOnce({ select: () => ({ lean: vi.fn().mockResolvedValue(safe) }) });
        const res = response();
        await updateProfile(request({ user: { _id: "user-1" }, body: { currentPassword: "old", newPassword: "NewPassword1!" } }), res, vi.fn());
        expect(user.password).toBe("NewPassword1!");
        expect(mocks.bumpTokenVersion).toHaveBeenCalledWith("user-1");
        expect(mocks.revokeAllRefreshTokens).toHaveBeenCalledWith("user-1");
        expect(res.json).toHaveBeenCalledWith({ message: "Profile updated", token: "access-token", user: safe });
    });

    it("keeps password-reset discovery private and sends eligible reset links", async () => {
        const genericMessage = { message: "If the email exists, a reset link has been sent" };
        for (const account of [null, { isVerified: false, provider: "local" }, { isVerified: true, provider: "google" }]) {
            mocks.findOne.mockResolvedValueOnce(account);
            const res = response();
            await forgotPassword(request({ body: { email: "user@example.com" } }), res, vi.fn());
            expect(res.json).toHaveBeenCalledWith(genericMessage);
        }

        const user = { _id: "user-1", isVerified: true, provider: "local", save: vi.fn().mockResolvedValue(undefined) };
        mocks.findOne.mockResolvedValueOnce(user);
        const eligible = response();
        await forgotPassword(request({ body: { email: "user@example.com" } }), eligible, vi.fn());
        expect(user.resetPasswordToken).toEqual(expect.any(String));
        expect(user.resetPasswordExpires).toBeInstanceOf(Date);
        expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "user@example.com", subject: "Reset your password" }));
        expect(mocks.auditCreate).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.forgot" }));
    });

    it("validates reset tokens and rotates sessions after a successful reset", async () => {
        mocks.findOne.mockResolvedValueOnce(null);
        const invalid = response();
        await resetPassword(request({ body: { email: "user@example.com", token: "bad", newPassword: "new" } }), invalid, vi.fn());
        expect(invalid.json).toHaveBeenCalledWith({ message: "Invalid token" });

        mocks.findOne.mockResolvedValueOnce({ resetPasswordExpires: new Date(Date.now() - 1000), provider: "local" });
        const expired = response();
        await resetPassword(request({ body: { email: "user@example.com", token: "old", newPassword: "new" } }), expired, vi.fn());
        expect(expired.json).toHaveBeenCalledWith({ message: "Token expired" });

        mocks.findOne.mockResolvedValueOnce({ resetPasswordExpires: new Date(Date.now() + 1000), provider: "google" });
        const oauth = response();
        await resetPassword(request({ body: { email: "user@example.com", token: "valid", newPassword: "new" } }), oauth, vi.fn());
        expect(oauth.json).toHaveBeenCalledWith({ message: "Password reset is only available for email/password accounts" });

        const user = { _id: "user-1", provider: "local", resetPasswordToken: "hash", resetPasswordExpires: new Date(Date.now() + 1000), save: vi.fn().mockResolvedValue(undefined) };
        mocks.findOne.mockResolvedValueOnce(user);
        const valid = response();
        await resetPassword(request({ body: { email: "user@example.com", token: "valid", newPassword: "NewPassword1!" } }), valid, vi.fn());
        expect(user).toMatchObject({ password: "NewPassword1!", resetPasswordToken: undefined, resetPasswordExpires: undefined });
        expect(mocks.bumpTokenVersion).toHaveBeenCalledWith("user-1");
        expect(mocks.revokeAllRefreshTokens).toHaveBeenCalledWith("user-1");
        expect(valid.json).toHaveBeenCalledWith({ message: "Password has been reset" });
    });

    it("blocks unsafe account deletion before destructive work starts", async () => {
        const unconfirmed = response();
        await deleteAccount(request({ user: { _id: "user-1" }, body: { confirmation: "delete" } }), unconfirmed, vi.fn());
        expect(unconfirmed.json).toHaveBeenCalledWith({ message: "Type DELETE to confirm" });

        mocks.findById.mockResolvedValueOnce(null);
        const missing = response();
        await deleteAccount(request({ user: { _id: "user-1" }, body: { confirmation: "DELETE" } }), missing, vi.fn());
        expect(missing.status).toHaveBeenCalledWith(404);

        mocks.findById.mockResolvedValueOnce({ provider: "local", matchPassword: vi.fn().mockResolvedValue(false) });
        const password = response();
        await deleteAccount(request({ user: { _id: "user-1" }, body: { confirmation: "DELETE", password: "wrong" } }), password, vi.fn());
        expect(password.json).toHaveBeenCalledWith({ message: "Current password is incorrect" });

        mocks.findById.mockResolvedValueOnce({ provider: "local", practiceSubscriptionStatus: "active", matchPassword: vi.fn().mockResolvedValue(true) });
        const subscribed = response();
        await deleteAccount(request({ user: { _id: "user-1" }, body: { confirmation: "DELETE", password: "correct" } }), subscribed, vi.fn());
        expect(subscribed.status).toHaveBeenCalledWith(409);
        expect(subscribed.json).toHaveBeenCalledWith({ message: "Cancel your active Practice subscription before deleting your account" });
    });
});
