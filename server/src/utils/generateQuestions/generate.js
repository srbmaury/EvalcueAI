import { generateJSON } from "./aiClient.js";
import fs from "fs";
import path from "path";
import { normalize, sanitizeText } from "./textUtils.js";
import { extractRoundKeywords } from "./roundKeywords.js";
import { getTechnicalTermsFromResume } from "./aiExtraction.js";
import { webSearchReferenceQuestions } from "./webGrounding.js";
import { fitsDeliveryMode, recordGuardEvent } from "./questionGuards.js";

const containsAllowed = (question, allowedSet) => {
    if (!allowedSet || allowedSet.size === 0) return true;
    const q = normalize(question);
    for (const kw of allowedSet) {
        const pattern = new RegExp(
            `(^|[^a-z0-9])${kw.replace(/[.+#]/g, (m) => `\\${m}`)}([^a-z0-9]|$)`,
            "i"
        );
        if (pattern.test(q)) return true;
    }
    return false;
};

const DSA_KEYWORDS = new Set([
    "dsa",
    "data structures",
    "algorithms",
    "array",
    "string",
    "linked list",
    "stack",
    "queue",
    "tree",
    "binary tree",
    "bst",
    "graph",
    "dp",
    "dynamic programming",
    "greedy",
    "recursion",
    "backtracking",
    "sorting",
    "searching",
    "hashing",
    "heap",
    "trie",
    "two pointers",
    "sliding window",
    "complexity",
    "big o",
]);

const STANDARD_SYSTEM_DESIGN_PROBLEMS = [
    "Design a URL shortening service like Bitly.",
    "Design a real-time chat system like WhatsApp.",
    "Design a cloud file storage and sharing service like Google Drive.",
    "Design a notification service that supports push, email, and SMS.",
    "Design a rate limiter for a large-scale API platform.",
    "Design a social-media news feed.",
    "Design a ride-hailing service like Uber.",
    "Design a video streaming platform like YouTube.",
    "Design a ticket-booking system that handles high-demand events.",
    "Design a metrics and monitoring platform for distributed services.",
];

const isDSAQuestion = (question) => containsAllowed(question, DSA_KEYWORDS);
const isSystemDesignRound = (name, description) => /system\s*design|system\s*architecture|distributed\s*system/i.test(`${name} ${description}`);

const parseGeneratedArray = (text) => {
    try {
        const parsed = JSON.parse(text || "[]");
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const generateStandardSystemDesignQuestions = async ({ role, round, roundDesc, count, exclusions = [] }) => {
    const prompt = `Generate exactly ${count} STANDARD software system-design interview problems for a ${role || "software engineering"} interview.

Round: ${round || "System Design"}
Round description: ${roundDesc || "Architecture and scalability discussion"}

Return ONLY a JSON array with this schema:
[{"text":"Design ...","tags":["System Design","..."]}]

Rules:
- These are canonical interview design problems, NOT questions about the candidate's resume, projects, employers, or past work.
- Do not mention or infer any candidate-specific technology stack.
- Use the role only to choose an appropriate difficulty/scope, not to personalize the problem.
- Prefer recognizable product/platform scenarios such as URL shortener, chat/messaging, file storage, news feed, notification service, rate limiter, ride hailing, video streaming, ticket booking, search/autocomplete, or monitoring.
- Ask for one whole system to design; do not turn the prompt into a checklist of subquestions.
- Keep each problem concise (<= 200 characters). The live interviewer will ask requirements, scale, failure, consistency, and trade-off follow-ups during the discussion.
- Avoid these existing problems: ${(exclusions || []).slice(0, 30).join(" | ") || "<none>"}.
- Return JSON only.`;

    try {
        const generated = parseGeneratedArray(await generateJSON(prompt));
        const seen = new Set((exclusions || []).map((item) => normalize(String(item))));
        const out = [];
        for (const item of generated) {
            const text = sanitizeText(typeof item === "string" ? item : item?.text, 200);
            if (!text) continue;
            const key = normalize(text);
            if (seen.has(key)) continue;
            seen.add(key);
            const tags = Array.from(new Set(["system design", ...(Array.isArray(item?.tags) ? item.tags : [])]))
                .map((tag) => sanitizeText(tag, 40).toLowerCase())
                .filter(Boolean)
                .slice(0, 5);
            out.push({ text, tags });
            if (out.length >= count) break;
        }
        if (out.length >= count) return out;
    } catch {
        // Fall through to the deterministic standard problem bank.
    }

    const excluded = new Set((exclusions || []).map((item) => normalize(String(item))));
    return STANDARD_SYSTEM_DESIGN_PROBLEMS
        .filter((text) => !excluded.has(normalize(text)))
        .slice(0, count)
        .map((text) => ({ text, tags: ["system design"] }));
};

export const generateQuestionsForRound = async ({
    company,
    jobRole,
    jobDescription,
    resumeText,
    roundName,
    roundDescription,
    deliveryMode,
    count,
    excludeTexts = [],
    dsaCountOffset = 0,
    grounding,
}) => {
    if (process.env.TEST_FORCE_GENERATOR_EMPTY === "true") {
        return [];
    }
    const safeCompany = sanitizeText(company, 120);
    const safeRole = sanitizeText(jobRole, 120);
    const safeJD = sanitizeText(jobDescription, 4000);
    const safeResume = sanitizeText(resumeText, 4000);
    const safeRound = sanitizeText(roundName, 60);
    const safeRoundDesc = sanitizeText(roundDescription, 400);
    const num = Math.min(Math.max(Number(count) || 5, 1), 20);

    if (isSystemDesignRound(safeRound, safeRoundDesc)) {
        return generateStandardSystemDesignQuestions({
            role: safeRole,
            round: safeRound,
            roundDesc: safeRoundDesc,
            count: num,
            exclusions: Array.from(excludeTexts || []),
        });
    }

    try {
        // Build prompt and ask AI for JSON via OpenAI (fallback to Gemini)

        const roundKeywords = extractRoundKeywords(safeRound, safeRoundDesc);
        const candidateKeywords = await getTechnicalTermsFromResume({ resumeText: safeResume });

        const seedTopics = roundKeywords.size > 0 ? roundKeywords : candidateKeywords;
        const webRefs = await webSearchReferenceQuestions(seedTopics, safeRole, safeRound);

        const roundListPreview = Array.from(roundKeywords).slice(0, 60);
        const candidateListPreview = Array.from(candidateKeywords).slice(0, 60);
        const exclusionsPreview = Array.from(excludeTexts).slice(0, 60);

        const templatePath = path.join(
            path.dirname(new URL(import.meta.url).pathname),
            "prompt.txt"
        );
        const rawTemplate = fs.readFileSync(templatePath, "utf8");
        const webRefsBlock = (webRefs || [])
            .slice(0, 10)
            .map((q, i) => `- Ref${i + 1}: ${q}`)
            .join("\n") || "<none>";
        const companyRefsBlock = (grounding?.reportedQuestions || [])
            .slice(0, 15)
            .map((question, index) => `- Reported${index + 1}: ${sanitizeText(question, 220)}`)
            .join("\n") || "<none>";
        const replacements = {
            num: String(num),
            company: safeCompany,
            role: safeRole,
            round: safeRound,
            roundDesc: safeRoundDesc,
            deliveryMode,
            jobDesc: safeJD,
            resume: safeResume,
            roundTopics: roundListPreview.join(", "),
            candidateTopics: candidateListPreview.join(", "),
            exclusions: exclusionsPreview.join(" | "),
            webRefs: webRefsBlock,
            companyRefs: companyRefsBlock,
        };
        const prompt = rawTemplate.replace(/\{\{(.*?)\}\}/g, (_, key) => {
            const k = String(key).trim();
            return Object.prototype.hasOwnProperty.call(replacements, k)
                ? replacements[k]
                : "";
        });

        const text = (await generateJSON(prompt)) || "[]";
        const cleaned = parseGeneratedArray(text);
        const out = [];
        let dsaCount = 0;
        const allowedKeywords = new Set(
            Array.from(roundKeywords.size > 0 ? roundKeywords : candidateKeywords)
        );
        const seen = new Set(
            Array.from(excludeTexts || []).map((t) => normalize(String(t)).slice(0, 200))
        );
        // Drop questions in the wrong format for the round (coding tasks in a conversation round, pure
        // discussion in a coding round), unless that would leave nothing usable.
        const formatted = cleaned.filter((item) => fitsDeliveryMode(typeof item === "string" ? item : item?.text, deliveryMode));
        const candidates = formatted.length ? formatted : cleaned;
        for (let i = 0; i < cleaned.length - formatted.length && formatted.length; i += 1) recordGuardEvent("question_generation", "format", "filtered");
        for (const item of candidates) {
            const rawText = typeof item === "string" ? item : item?.text;
            const rawTags = Array.isArray(item?.tags) ? item.tags : [];
            const s = sanitizeText(rawText, 200);
            if (!s) continue;
            const key = normalize(s).slice(0, 200);
            if (seen.has(key)) continue;
            // Soft keyword relevance check: skip only when BOTH round and candidate keywords
            // exist and the question matches neither — this lets behavioral/HR questions
            // through even when they don't literally contain keyword tokens.
            if (
                roundKeywords.size > 0 &&
                candidateKeywords.size > 0 &&
                !containsAllowed(s, roundKeywords) &&
                !containsAllowed(s, candidateKeywords)
            ) {
                continue;
            }
            const looksDSA =
                isDSAQuestion(s) ||
                rawTags.some((t) => /\bdsa\b/i.test(String(t)));
            if (looksDSA && dsaCountOffset + dsaCount >= 3) continue;
            const tags = Array.from(
                new Set(
                    rawTags
                        .concat(
                            Array.from(roundKeywords).filter((kw) =>
                                containsAllowed(s, new Set([kw]))
                            )
                        )
                        .concat(
                            Array.from(candidateKeywords).filter((kw) =>
                                containsAllowed(s, new Set([kw]))
                            )
                        )
                        .slice(0, 8)
                )
            )
                .map((t) => (t || "").toString().toLowerCase().trim())
                .filter(Boolean)
                .slice(0, 5);
            if (looksDSA && !tags.some((t) => t === "dsa")) tags.unshift("dsa");
            seen.add(key);
            if (looksDSA) dsaCount++;
            out.push({ text: s, tags });
            if (out.length >= num) break;
        }
        return out;
    } catch (error) {
        console.error(error);
        throw error;
    }
};
