// Deterministic checks on AI-generated interview questions. Prompts ask the model not to invent facts,
// repeat itself, or use the wrong question format; these guards catch the cases where it still does.

import metrics from "../../metrics/index.js";

// stage: followup | next_question | question_generation; guard: invented_specifics | repeat | format;
// outcome: retried | recovered | suppressed | filtered.
export const recordGuardEvent = (stage, guard, outcome) => {
    try { metrics.aiQuestionGuardEventsTotal.labels(stage, guard, outcome).inc(); } catch { /* metrics are best effort */ }
};

const WORD = /[a-z0-9]+/g;
const STOP = new Set(["a", "an", "the", "and", "or", "to", "of", "in", "on", "for", "with", "you", "your", "how", "what", "did", "do", "would", "can", "could", "is", "are", "that", "this", "it", "as", "at", "by", "be", "about", "specific", "specifically", "explain", "describe", "elaborate", "more", "detail", "details"]);

const contentWords = (text = "") => new Set((String(text).toLowerCase().match(WORD) || []).filter((word) => word.length > 2 && !STOP.has(word)));

// Numbers and percentages ("50%", "10,000", "8 seconds") are the most damaging invented specifics:
// a question like "how did you measure your 50% reduction?" presumes a result the candidate never claimed.
const specificsIn = (text = "") => (String(text).match(/\d[\d,.]*\s*%?/g) || [])
    .map((token) => token.replace(/[,\s]/g, "").replace(/\.$/, ""))
    .filter((token) => token && token !== "1");

export const unsupportedSpecifics = (question = "", context = "") => {
    const available = new Set(specificsIn(context));
    return [...new Set(specificsIn(question))].filter((token) => !available.has(token) && !available.has(token.replace(/%$/, "")));
};

// Word-overlap similarity (Jaccard) between two questions; paraphrases of the same probe score high.
export const questionSimilarity = (a = "", b = "") => {
    const left = contentWords(a);
    const right = contentWords(b);
    if (!left.size || !right.size) return 0;
    let shared = 0;
    for (const word of left) if (right.has(word)) shared += 1;
    return shared / (left.size + right.size - shared);
};

// Share of the shorter question's key words that also appear in the other one. Catches the common repeat
// pattern "same probe + an extra clause", which dilutes plain overlap.
export const questionContainment = (a = "", b = "") => {
    const left = contentWords(a);
    const right = contentWords(b);
    const smaller = left.size <= right.size ? left : right;
    const larger = smaller === left ? right : left;
    if (smaller.size < 3) return 0;
    let shared = 0;
    for (const word of smaller) if (larger.has(word)) shared += 1;
    return shared / smaller.size;
};

export const REPEAT_SIMILARITY = 0.6;
export const REPEAT_CONTAINMENT = 0.8;

export const repeatsEarlierQuestion = (question = "", earlier = []) => earlier.some((item) => (
    questionSimilarity(question, item) >= REPEAT_SIMILARITY || questionContainment(question, item) >= REPEAT_CONTAINMENT
));

const CODE_TASK = /^\s*(write|implement|code|build|create)\b[^.?]{0,80}\b(function|method|class|program|query|endpoint|api|script|algorithm|data structure)\b/i;
const DISCUSSION = /^\s*(how would you|how do you|explain|describe|walk me through|can you (?:explain|describe|walk|tell)|tell me about|what (?:is|are|would))\b/i;

// Conversational rounds should not ask for code; online-assessment rounds should not be pure discussion.
export const fitsDeliveryMode = (question = "", deliveryMode = "conversational") => {
    if (deliveryMode === "conversational") return !CODE_TASK.test(question);
    if (deliveryMode === "online-assessment") return !DISCUSSION.test(question) || CODE_TASK.test(question);
    return true;
};
