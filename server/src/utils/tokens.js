import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import RefreshToken from "../models/RefreshToken.js";

const ACCESS_TTL_SECONDS = Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 15 * 60);
const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 7);
const REFRESH_ROTATION_GRACE_MS = Math.max(Number(process.env.REFRESH_ROTATION_GRACE_MS || 30_000), 5_000);

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

const newRefreshToken = (userId, { userAgent, ip } = {}) => {
    const raw = crypto.randomBytes(40).toString("hex");
    const tokenHash = hashOpaqueToken(raw);
    const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
    return { raw, tokenHash, expiresAt, record: { user: userId, tokenHash, expiresAt, userAgent, ip } };
};

export const issueRefreshToken = async (userId, metadata = {}) => {
    const next = newRefreshToken(userId, metadata);
    await RefreshToken.create(next.record);
    return { raw: next.raw, expiresAt: next.expiresAt };
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

export const rotateRefreshToken = async (raw, metadata = {}) => {
    if (!raw) return null;
    const now = new Date();
    const tokenHash = hashOpaqueToken(raw);
    const current = await RefreshToken.findOne({ tokenHash }).select("+replacedByTokenHash +rotationGraceUntil").lean();
    if (!current) return null;
    if (current.expiresAt < now) {
        await RefreshToken.deleteOne({ _id: current._id });
        return null;
    }

    if (current.replacedByTokenHash) {
        if (current.rotationGraceUntil && current.rotationGraceUntil >= now) {
            return { userId: current.user, rotated: false, concurrentGrace: true };
        }
        return null;
    }

    const next = newRefreshToken(current.user, metadata);
    await RefreshToken.create(next.record);
    const graceUntil = new Date(now.getTime() + REFRESH_ROTATION_GRACE_MS);
    const claimed = await RefreshToken.findOneAndUpdate(
        { _id: current._id, replacedByTokenHash: "", expiresAt: { $gt: now } },
        { $set: { replacedByTokenHash: next.tokenHash, rotationGraceUntil: graceUntil, rotatedAt: now } },
        { new: true },
    ).select("+replacedByTokenHash +rotationGraceUntil");

    if (!claimed || claimed.replacedByTokenHash !== next.tokenHash) {
        await RefreshToken.deleteOne({ tokenHash: next.tokenHash }).catch(() => {});
        const winner = await RefreshToken.findOne({ _id: current._id }).select("+replacedByTokenHash +rotationGraceUntil").lean();
        if (winner?.rotationGraceUntil && winner.rotationGraceUntil >= new Date()) {
            return { userId: current.user, rotated: false, concurrentGrace: true };
        }
        return null;
    }

    return { userId: current.user, rotated: true, raw: next.raw, expiresAt: next.expiresAt };
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
// A malformed COOKIE_DOMAIN (e.g. "4") makes browsers silently drop the refresh cookie, which logs
// everyone out on every page load. Ignore anything that is not a hostname and say so once.
let warnedInvalidCookieDomain = false;
const cookieDomain = () => {
    const value = String(process.env.COOKIE_DOMAIN || "").trim();
    if (!value) return undefined;
    if (/^\.?[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(value) && !/^\.?[\d.]+$/.test(value)) return value;
    if (!warnedInvalidCookieDomain) {
        warnedInvalidCookieDomain = true;
        console.warn(`[auth] Ignoring invalid COOKIE_DOMAIN "${value}"; refresh cookies will use the request host.`);
    }
    return undefined;
};

export const refreshCookieOptions = () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.COOKIE_SAMESITE || (process.env.NODE_ENV === "production" ? "strict" : "lax"),
    domain: cookieDomain(),
    path: "/api/auth",
});

export const setRefreshCookie = (res, raw, expiresAt) => {
    res.cookie("refreshToken", raw, { ...refreshCookieOptions(), expires: expiresAt });
};

export default {
    signAccessToken,
    hashOpaqueToken,
};
