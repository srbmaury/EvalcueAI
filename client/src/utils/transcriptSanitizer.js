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

const comparableToken = (value = "") => value.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "");

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

// Speech-to-text models commonly emit these from background noise or a mic tone. A segment made only
// of them carries no answer content; real one-word answers such as "yes" or "okay" are kept.
const NOISE_ONLY_SEGMENT = /^(?:you|thank you|thanks|bye|bye bye|uh|um|hmm|mm)(?: (?:you|thank you|thanks|bye|uh|um|hmm|mm))*$/;

const isNoiseOnlySegment = (text) => NOISE_ONLY_SEGMENT.test(
    text.toLowerCase().replace(/[.!?,;:"'’`…-]+/g, " ").replace(/\s+/g, " ").trim(),
);

export const looksLikeSilenceHallucination = (value = "") => {
    const text = normalize(value);
    if (!text) return true;
    if (isNoiseOnlySegment(text)) return true;
    // Symbols with no letters or digits (e.g. "♪♪♪" transcribed from a tone or music) carry no answer content.
    if (!/[\p{L}\p{N}]/u.test(text)) return true;
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

/**
 * Browser speech recognition can commit overlapping final segments when it
 * restarts or rotates recorders. Merge the longest token overlap at the
 * boundary instead of blindly concatenating, while leaving the rest of the
 * candidate's wording untouched.
 */
export const mergeTranscriptText = (existing = "", incoming = "") => {
    const left = normalize(existing);
    const right = normalize(incoming);
    if (!right) return left;
    if (!left) return right;

    const leftTokens = left.split(" ");
    const rightTokens = right.split(" ");
    const maxOverlap = Math.min(leftTokens.length, rightTokens.length, 24);
    let overlap = 0;
    for (let size = maxOverlap; size >= 1; size -= 1) {
        const matches = leftTokens.slice(-size).every((token, index) => (
            comparableToken(token) === comparableToken(rightTokens[index])
        ));
        if (matches) {
            overlap = size;
            break;
        }
    }

    const remainder = rightTokens.slice(overlap).join(" ").trim();
    return remainder ? `${left} ${remainder}` : left;
};
