import "../../config/bootstrapEnv.js";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import metrics from "../../metrics/index.js";
import productionMetrics from "../../metrics/production.js";

export const ADAPTIVE_PROMPT_BUNDLE_VERSION = "adaptive-2026-09-v1";
export const FEEDBACK_PROMPT_BUNDLE_VERSION = "feedback-2026-09-v1";

const classifyPromptPurpose = (prompt) => {
    const text = (prompt || "").toString().toLowerCase();
    if (text.startsWith("design the evidence plan for one adaptive technical interview round")) return "adaptive_plan";
    if (text.startsWith("evaluate one completed technical interview question")) return "adaptive_evaluation";
    if (text.startsWith("generate exactly one next question for an adaptive technical interview")) return "adaptive_question";
    if (text.startsWith("you are conducting a realistic") && text.includes("follow-up")) return "adaptive_followup";
    if (text.startsWith("you are a rigorous, evidence-based technical interviewer")) return "feedback_evaluation";
    return "other";
};

const promptVersionForPurpose = (purpose) => {
    if (purpose.startsWith("adaptive_")) return ADAPTIVE_PROMPT_BUNDLE_VERSION;
    if (purpose === "feedback_evaluation") return FEEDBACK_PROMPT_BUNDLE_VERSION;
    return "unversioned";
};

const observePurpose = (provider, model, purpose, promptVersion, outcome) => {
    try { metrics.aiPurposeRequestsTotal.labels(provider, model, purpose, promptVersion, outcome).inc(); } catch {}
};

const observeTokens = (provider, model, purpose, type, value) => {
    if (!Number.isFinite(value) || Number(value) < 0) return;
    metrics.aiTokensTotal.labels(provider, model, type).inc(Number(value));
    productionMetrics.aiTokensByPurposeTotal.labels(provider, model, purpose, type).inc(Number(value));
};

// Module-level singletons — created once, reused across all requests
let _openaiClient = null;
let _geminiClient = null;
let _geminiModel = null;

const getOpenAIClient = () => {
    if (!_openaiClient) {
        _openaiClient = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY || "",
            maxRetries: Number(process.env.AI_MAX_RETRIES || 1),
        });
    }
    return _openaiClient;
};

const getGeminiModel = () => {
    if (!_geminiModel) {
        _geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
        const modelName = process.env.GEMINI_MODEL_NAME || "gemini-3.6-flash";
        _geminiModel = _geminiClient.getGenerativeModel({
            model: modelName,
            generationConfig: { responseMimeType: "application/json" },
        });
    }
    return _geminiModel;
};

const withTimeout = (promise, ms, label = "operation") => {
    const timeoutMs = Math.max(Number(ms) || 0, 0);
    if (timeoutMs === 0) return promise;
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    return Promise.race([
        promise.finally(() => { if (timer) clearTimeout(timer); }),
        timeout,
    ]);
};

const coerceToRawJSON = (input) => {
    const raw = (input || "").toString().trim();
    if (!raw) return "";
    const fenced = raw.replace(/^```(?:json)?\n([\s\S]*?)\n```$/i, "$1").trim();
    try { JSON.parse(fenced); return fenced; } catch (_) {}
    const firstArrayStart = fenced.indexOf("[");
    const firstObjectStart = fenced.indexOf("{");
    const start = [firstArrayStart, firstObjectStart].filter((i) => i !== -1).sort((a, b) => a - b)[0];
    if (start === undefined) return "";
    const end = Math.max(fenced.lastIndexOf("]"), fenced.lastIndexOf("}"));
    if (end > start) {
        const slice = fenced.slice(start, end + 1).trim();
        try { JSON.parse(slice); return slice; } catch (_) {}
    }
    return "";
};

export const generateJSON = async (prompt) => {
    const trimmed = (prompt || "").toString().slice(0, 16000);
    const purpose = classifyPromptPurpose(trimmed);
    const promptVersion = promptVersionForPurpose(purpose);
    const aiTimeoutMs = Math.min(
        Math.max(parseInt(process.env.AI_REQUEST_TIMEOUT_MS || "20000", 10) || 20000, 2000),
        120000
    );

    const openAiModel = process.env.OPENAI_MODEL_NAME || "gpt-4o-mini";
    const openAiStartedAt = process.hrtime.bigint();
    try {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error("OPENAI_API_KEY not set");
        }
        const completion = await withTimeout(
            getOpenAIClient().chat.completions.create({
                model: openAiModel,
                messages: [
                    { role: "system", content: "Return ONLY raw JSON. No code fences." },
                    { role: "user", content: trimmed },
                ],
                // Scoring should be repeatable: the same answer should get the same score on a re-run.
                temperature: ["feedback_evaluation", "adaptive_evaluation"].includes(purpose) ? 0 : 0.2,
            }),
            aiTimeoutMs,
            "OpenAI request"
        );
        observeTokens("openai", openAiModel, purpose, "input", completion?.usage?.prompt_tokens);
        observeTokens("openai", openAiModel, purpose, "output", completion?.usage?.completion_tokens);
        const text = completion?.choices?.[0]?.message?.content || "";
        const normalized = coerceToRawJSON(text);
        if (normalized || (text && text.trim())) {
            metrics.aiRequestsTotal.labels("openai", openAiModel, "success").inc();
            observePurpose("openai", openAiModel, purpose, promptVersion, "success");
            metrics.aiRequestDurationSeconds.labels("openai", openAiModel, "success").observe(Number(process.hrtime.bigint() - openAiStartedAt) / 1e9);
            return normalized || text.trim();
        }
        metrics.aiInvalidResponsesTotal.labels("openai", openAiModel).inc();
        throw new Error("Empty OpenAI response");
    } catch (_e) {
        metrics.aiRequestsTotal.labels("openai", openAiModel, "failure").inc();
        observePurpose("openai", openAiModel, purpose, promptVersion, "failure");
        metrics.aiRequestDurationSeconds.labels("openai", openAiModel, "failure").observe(Number(process.hrtime.bigint() - openAiStartedAt) / 1e9);
        metrics.aiFallbacksTotal.labels("openai", "gemini").inc();
        console.warn("[AI][OpenAI] request failed:", _e?.message || _e);
        const geminiModel = process.env.GEMINI_MODEL_NAME || "gemini-3.6-flash";
        const geminiStartedAt = process.hrtime.bigint();
        try {
            if (!process.env.GEMINI_API_KEY) {
                throw new Error("GEMINI_API_KEY not set");
            }
            const result = await withTimeout(
                getGeminiModel().generateContent(trimmed),
                aiTimeoutMs,
                "Gemini request"
            );
            const usage = result?.response?.usageMetadata || {};
            observeTokens("gemini", geminiModel, purpose, "input", usage.promptTokenCount);
            observeTokens("gemini", geminiModel, purpose, "output", usage.candidatesTokenCount);
            const text = result?.response?.text?.() || "";
            const normalized = coerceToRawJSON(text);
            if (!normalized && !text.trim()) {
                metrics.aiInvalidResponsesTotal.labels("gemini", geminiModel).inc();
                throw new Error("Empty Gemini response");
            }
            metrics.aiRequestsTotal.labels("gemini", geminiModel, "success").inc();
            observePurpose("gemini", geminiModel, purpose, promptVersion, "success");
            metrics.aiRequestDurationSeconds.labels("gemini", geminiModel, "success").observe(Number(process.hrtime.bigint() - geminiStartedAt) / 1e9);
            return normalized || text;
        } catch (fallbackErr) {
            metrics.aiRequestsTotal.labels("gemini", geminiModel, "failure").inc();
            observePurpose("gemini", geminiModel, purpose, promptVersion, "failure");
            metrics.aiRequestDurationSeconds.labels("gemini", geminiModel, "failure").observe(Number(process.hrtime.bigint() - geminiStartedAt) / 1e9);
            console.warn("[AI][Gemini] request failed:", fallbackErr?.message || fallbackErr);
            return "";
        }
    }
};

export const getFetch = async () => {
    if (typeof fetch !== "undefined") return fetch;
    const { default: nodeFetch } = await import("node-fetch");
    return nodeFetch;
};
