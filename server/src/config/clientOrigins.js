const normalizeOrigin = (value, fallback) => String(value || fallback).split(",")[0].trim().replace(/\/+$/, "");

const legacyClientOrigin = () => process.env.CLIENT_ORIGIN || process.env.CLIENT_URL || "http://localhost:5173";

export const practiceClientOrigin = () => normalizeOrigin(
    process.env.PRACTICE_CLIENT_ORIGIN,
    legacyClientOrigin(),
);

export const hiringClientOrigin = () => normalizeOrigin(
    process.env.HIRING_CLIENT_ORIGIN,
    legacyClientOrigin(),
);
