import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import RefreshToken from "../models/RefreshToken.js";

const ACCESS_TTL_SECONDS = Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 15 * 60);
const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 7);

export const signAccessToken = (userId, tokenVersion) => {
    const payload = { id: userId };
    if (tokenVersion != null) payload.tokenVersion = tokenVersion;
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: `${ACCESS_TTL_SECONDS}s` });
};

export const bumpTokenVersion = async (userId) => {
    try {
        await User.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } }).lean();
    } catch {}
};

export const hashOpaqueToken = (raw) => crypto.createHash("sha256").update(raw).digest("hex");

export const issueRefreshToken = async (userId, { userAgent, ip } = {}) => {
    const raw = crypto.randomBytes(40).toString("hex");
    const tokenHash = hashOpaqueToken(raw);
    const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
    // Refresh tokens represent independent browser/device sessions. Creating a
    // new session must not invalidate sessions that are already signed in.
    await RefreshToken.create({ user: userId, tokenHash, expiresAt, userAgent, ip });
    return { raw, expiresAt };
};

export const validateRefreshToken = async (raw) => {
    const tokenHash = hashOpaqueToken(raw);
    const record = await RefreshToken.findOne({ tokenHash }).lean();
    if (!record) return null;
    if (record.expiresAt < new Date()) {
        await RefreshToken.deleteOne({ _id: record._id });
        return null;
    }
    return record.user;
};

export const revokeRefreshToken = async (raw) => {
    if (!raw) return;
    await RefreshToken.deleteOne({ tokenHash: hashOpaqueToken(raw) });
};

export const revokeAllRefreshTokens = async (userId) => {
    await RefreshToken.deleteMany({ user: userId });
};

// Single source of truth for the refresh-token cookie: password, Google, and SSO
// login previously each defined their own copy of these options and drifted apart
// (SSO defaulted to SameSite=None in production while the others used Strict).
export const refreshCookieOptions = () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.COOKIE_SAMESITE || (process.env.NODE_ENV === "production" ? "strict" : "lax"),
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: "/api/auth",
});

export const setRefreshCookie = (res, raw, expiresAt) => {
    res.cookie("refreshToken", raw, { ...refreshCookieOptions(), expires: expiresAt });
};

export default {
    signAccessToken,
    hashOpaqueToken,
};
