const normalizeOrigin = (value, fallback) => String(value || fallback).split(",")[0].trim().replace(/\/+$/, "");

export const practiceClientOrigin = () => normalizeOrigin(process.env.PRACTICE_CLIENT_ORIGIN, "http://localhost:5173");

export const hiringClientOrigin = () => normalizeOrigin(process.env.HIRING_CLIENT_ORIGIN, "http://localhost:5173");

// Browser origins allowed to call the API: ALLOWED_ORIGINS when set, otherwise the client and server origins.
export const allowedOrigins = () => {
    const list = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (list.length > 0) return list;
    return [...new Set([practiceClientOrigin(), hiringClientOrigin(), process.env.SERVER_ORIGIN || "http://localhost:5000"])];
};
