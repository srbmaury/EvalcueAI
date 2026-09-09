const OUTRO_PATTERNS = [
    /thanks?\s+for\s+watching/i,
    /thank\s+you\s+for\s+watching/i,
    /like\s+and\s+subscribe/i,
    /don'?t\s+forget\s+to\s+subscribe/i,
    /subscribe\s+to\s+my\s+channel/i,
];

const normalize = (value = "") => value
    .toString()
    .replace(/\s+/g, " ")
    .trim();

const repeatedOutroOnly = (text) => {
    const cleaned = text
        .toLowerCase()
        .replace(/[.!?,;:"'’`]+/g, "")
        .replace(/\s+/g, " ")
        .trim();
    if (!cleaned) return false;
    const stripped = cleaned
        .replace(/(?:thank you for watching|thanks for watching|thank you so much for watching)\s*/g, "")
        .replace(/(?:and )?don'?t forget to like and subscribe\s*/g, "")
        .replace(/(?:please )?like and subscribe\s*/g, "")
        .trim();
    return stripped.length === 0;
};

const hasRepeatingOutro = (text) => {
    const lower = text.toLowerCase();
    const thanksCount = (lower.match(/thanks?\s+for\s+watching/g) || []).length
        + (lower.match(/thank\s+you\s+for\s+watching/g) || []).length;
    return thanksCount >= 2;
};

export const looksLikeSilenceHallucination = (value = "") => {
    const text = normalize(value);
    if (!text) return true;
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const outroMatches = OUTRO_PATTERNS.filter((pattern) => pattern.test(text)).length;
    if (repeatedOutroOnly(text)) return true;
    if (hasRepeatingOutro(text)) return true;
    if (outroMatches >= 2) return true;
    if (wordCount <= 14 && outroMatches >= 1) return true;
    return false;
};

export const sanitizeTranscriptSegment = (value = "") => {
    const text = normalize(value);
    if (looksLikeSilenceHallucination(text)) return "";
    return text;
};
