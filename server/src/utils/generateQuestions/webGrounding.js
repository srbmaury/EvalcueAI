import { getFetch } from "./aiClient.js";
import { normalize, sanitizeText } from "./textUtils.js";

const extractQuestionsFromText = (text) => {
    const content = sanitizeText(text, 1200);
    const splits = content
        .split(/(?<=[\.?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
    const out = [];
    for (const s of splits) {
        const cand = s.endsWith("?")
            ? s
            : s.length <= 120 &&
              /^(what|how|why|explain|describe|design|implement|compare|when|where|which)\b/i.test(
                  s
              )
            ? `${s.replace(/[.!]+$/, "")}?`
            : null;
        if (cand) out.push(cand.slice(0, 200));
        if (out.length >= 40) break;
    }
    return out;
};

export const webSearchReferenceQuestions = async (topics, role, roundName) => {
    try {
        const apiKey = process.env.TAVILY_API_KEY;
        if (!apiKey) return [];
        const f = await getFetch();
        const tavilyTimeoutMs = Math.min(
            Math.max(parseInt(process.env.TAVILY_TIMEOUT_MS || "8000", 10) || 8000, 1000),
            60000
        );
        const queries = Array.from(topics)
            .slice(0, 3)
            .map((t) => `${t} interview questions ${role} ${roundName}`.trim());
        const results = [];
        for (const q of queries) {
            const body = {
                api_key: apiKey,
                query: q,
                search_depth: "basic",
                include_answer: false,
                max_results: 5,
            };
            const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
            const timer = controller ? setTimeout(() => controller.abort(), tavilyTimeoutMs) : null;
            const resp = await f("https://api.tavily.com/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                signal: controller ? controller.signal : undefined,
            });
            if (timer) clearTimeout(timer);
            if (!resp.ok) continue;
            const json = await resp.json();
            const arr = Array.isArray(json?.results) ? json.results : [];
            for (const r of arr) {
                results.push(...extractQuestionsFromText(r?.content || ""));
                if (results.length >= 40) break;
            }
            if (results.length >= 40) break;
        }
        const uniq = [];
        const seen = new Set();
        for (const q of results) {
            const key = normalize(q).slice(0, 200);
            if (!seen.has(key)) {
                seen.add(key);
                uniq.push(q);
            }
            if (uniq.length >= 40) break;
        }
        return uniq;
    } catch (_e) {
        return [];
    }
};
