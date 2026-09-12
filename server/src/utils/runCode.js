import fetch from "node-fetch";
import metrics from "../metrics/index.js";
import { buildJudge0SubmissionUrl } from "./judge0.js";

const getLanguageId = (language) => {
    switch (language) {
        case "javascript": return 63;
        case "python": return 71;
        case "cpp": return 54;
        case "java": return 62;
        default: return 63;
    }
};

const executionError = (message, statusCode = 502) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

export const executeJudge0Submission = async (payload, { metricLanguage = "judge0" } = {}) => {
    if (!payload || typeof payload !== "object") throw executionError("Missing Judge0 submission payload", 400);
    if (!process.env.JUDGE0_URL || !process.env.JUDGE0_KEY) {
        throw executionError("Code execution is temporarily unavailable", 503);
    }

    const timeoutMs = Math.max(parseInt(process.env.JUDGE0_TIMEOUT_MS || "15000", 10) || 15000, 1000);
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
        const response = await fetch(buildJudge0SubmissionUrl(process.env.JUDGE0_URL), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-RapidAPI-Key": process.env.JUDGE0_KEY,
                ...(process.env.JUDGE0_HOST ? { "X-RapidAPI-Host": process.env.JUDGE0_HOST } : {}),
            },
            body: JSON.stringify(payload),
            signal: controller ? controller.signal : undefined,
        });

        if (!response.ok) {
            const text = await response.text();
            try { metrics.runCodeTotal.labels(metricLanguage, "failure", "remote").inc(); } catch {}
            throw executionError(text || "Judge0 error", response.status);
        }

        const data = await response.json();
        if (data?.token && !data?.status) {
            try { metrics.runCodeTotal.labels(metricLanguage, "failure", "remote").inc(); } catch {}
            throw executionError("Execution provider returned before the result was ready. Please run again.", 502);
        }

        const status = data?.status || {};
        const statusDescription = status?.description || "";
        const stdout = data?.stdout || "";
        const stderr = data?.stderr || "";
        const compileOutputRaw = data?.compile_output || "";
        const message = data?.message || "";
        const isCompilationError = /compilation/i.test(statusDescription) || !!compileOutputRaw;
        const isRuntimeError = /runtime/i.test(statusDescription) || (!!stderr && !isCompilationError);
        const isError = isCompilationError || isRuntimeError;
        const errorType = isCompilationError ? "compile" : isRuntimeError ? "runtime" : "none";

        let preferredOutput = "";
        if (isCompilationError) preferredOutput = compileOutputRaw || stderr || message || stdout || "";
        else if (isRuntimeError) preferredOutput = stderr || message || stdout || "";
        else preferredOutput = stdout || message || statusDescription || "Execution completed";

        try { metrics.runCodeTotal.labels(metricLanguage, isError ? "failure" : "success", errorType).inc(); } catch {}
        return {
            output: preferredOutput,
            stdout,
            stderr,
            compileOutput: compileOutputRaw,
            message,
            status: { id: status?.id, description: statusDescription },
            isError,
            errorType,
            time: data?.time,
            memory: data?.memory,
        };
    } catch (error) {
        if (error?.statusCode) throw error;
        try { metrics.runCodeTotal.labels(metricLanguage || "unknown", "failure", "exception").inc(); } catch {}
        const isAbort = error && (error.name === "AbortError" || /aborted|timeout/i.test(error.message));
        throw executionError(isAbort ? "Execution timed out" : (error?.message || "Code execution failed"), isAbort ? 504 : 502);
    } finally {
        if (timer) clearTimeout(timer);
    }
};

export const executeCode = async ({ language, code, stdin = "" }) => {
    if (!language || !code) throw executionError("Missing language or code", 400);
    return executeJudge0Submission({
        language_id: getLanguageId(language),
        source_code: code,
        stdin: stdin || "",
    }, { metricLanguage: language });
};

const runCode = async (req, res) => {
    try {
        const result = await executeCode(req.body || {});
        return res.json(result);
    } catch (error) {
        return res.status(error?.statusCode || 502).json({ error: error?.message || "Code execution failed" });
    }
};

export default runCode;
