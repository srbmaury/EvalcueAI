import { getFetch } from "../utils/generateQuestions/aiClient.js";
import { normalize, sanitizeText } from "../utils/generateQuestions/textUtils.js";
import metrics from "../metrics/index.js";
import { cleanSourceSnippet } from "../utils/sourceSnippet.js";

const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map();

const extractQuestions = (text) => sanitizeText(text, 3000)
    .split(/(?<=[.?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.endsWith("?") || /^(what|how|why|explain|describe|design|implement|compare|tell me|write|solve)\b/i.test(part))
    .map((part) => part.endsWith("?") ? part : `${part}?`)
    .filter((part) => part.length >= 12 && part.length <= 220);

const safeUrl = (value) => {
    try {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
    } catch { return ""; }
};

export const getCompanyGrounding = async (company, role) => {
    const startedAt = process.hrtime.bigint();
    const safeCompany = sanitizeText(company, 120);
    const safeRole = sanitizeText(role, 120);
    const key = `${normalize(safeCompany)}::${normalize(safeRole)}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached.value;

    const empty = { status: "simulation", retrievedAt: new Date(), sources: [], reportedQuestions: [] };
    if (process.env.NODE_ENV === "test" && process.env.TEST_ENABLE_COMPANY_GROUNDING !== "true") return empty;
    if (!process.env.TAVILY_API_KEY || !safeCompany || !safeRole) {
        metrics.interviewGroundingTotal.labels("not_configured").inc();
        return empty;
    }
    try {
        const fetchImpl = await getFetch();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.min(Math.max(Number(process.env.TAVILY_TIMEOUT_MS) || 8000, 1000), 30000));
        const response = await fetchImpl("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key: process.env.TAVILY_API_KEY,
                query: `${safeCompany} ${safeRole} interview experience rounds questions`,
                search_depth: "advanced",
                include_answer: false,
                max_results: 8,
            }),
            signal: controller.signal,
        }).finally(() => clearTimeout(timer));
        if (!response.ok) return empty;
        const json = await response.json();
        const rawSources = Array.isArray(json?.results) ? json.results : [];
        const sources = rawSources.map((source) => ({
            title: sanitizeText(source?.title, 180),
            url: safeUrl(source?.url),
            snippet: sanitizeText(cleanSourceSnippet(source?.content, source?.title), 700),
        })).filter((source) => source.title && source.url).slice(0, 6);
        const seen = new Set();
        const reportedQuestions = [];
        for (const source of sources) {
            for (const question of extractQuestions(source.snippet)) {
                const normalized = normalize(question);
                if (!seen.has(normalized)) { seen.add(normalized); reportedQuestions.push(question); }
                if (reportedQuestions.length >= 20) break;
            }
        }
        const value = { status: sources.length ? "grounded" : "simulation", retrievedAt: new Date(), sources, reportedQuestions };
        metrics.interviewGroundingTotal.labels(value.status).inc();
        metrics.interviewGroundingDurationSeconds.labels(value.status).observe(Number(process.hrtime.bigint() - startedAt) / 1e9);
        metrics.interviewGroundingSources.observe(sources.length);
        cache.set(key, { cachedAt: Date.now(), value });
        return value;
    } catch {
        metrics.interviewGroundingTotal.labels("failure").inc();
        metrics.interviewGroundingDurationSeconds.labels("failure").observe(Number(process.hrtime.bigint() - startedAt) / 1e9);
        return empty;
    }
};

export default getCompanyGrounding;
