import { sanitizeText } from "../../utils/generateQuestions/textUtils.js";

export const clamp = (value, min, max, fallback = min) => {
    const parsed = Number(value);
    const resolved = Number.isFinite(parsed) ? parsed : fallback;
    return Math.min(Math.max(resolved, min), max);
};
export const clean = (value, max = 300) => sanitizeText(value, max);
export const keyOf = (value) => clean(value, 120).toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim();
export const uniqueStrings = (values, max = 8, length = 120) => {
    const out = [];
    const seen = new Set();
    for (const value of Array.isArray(values) ? values : []) {
        const text = clean(value, length);
        const key = keyOf(text);
        if (!text || !key || seen.has(key)) continue;
        seen.add(key);
        out.push(text);
        if (out.length >= max) break;
    }
    return out;
};
