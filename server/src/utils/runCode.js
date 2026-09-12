import fetch from "node-fetch";
import metrics from "../metrics/index.js";
import { buildJudge0SubmissionUrl } from "./judge0.js";

const getLanguageId = (language) => {
    switch (language) {
        case "javascript":
            return 63; // Judge0 ID for JS
        case "python":
            return 71; // Python 3
        case "cpp":
            return 54; // C++
        case "java":
            return 62; // Java
        default:
            return 63; // Default to JS
    }
};

const runCode = async (req, res) => {
    const { language, code, stdin } = req.body;

    if (!language || !code)
        return res.status(400).json({ error: "Missing language or code" });

    if (!process.env.JUDGE0_URL || !process.env.JUDGE0_KEY) {
        return res.status(503).json({ error: "Code execution is temporarily unavailable" });
    }

    try {
        const timeoutMs = Math.max(parseInt(process.env.JUDGE0_TIMEOUT_MS || "15000", 10) || 15000, 1000);
        const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
        const response = await fetch(
            buildJudge0SubmissionUrl(process.env.JUDGE0_URL),
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-RapidAPI-Key": process.env.JUDGE0_KEY,
                    ...(process.env.JUDGE0_HOST ? { "X-RapidAPI-Host": process.env.JUDGE0_HOST } : {}),
                },
                body: JSON.stringify({
                    language_id: getLanguageId(language),
                    source_code: code,
                    stdin: stdin || "",
                }),
                signal: controller ? controller.signal : undefined,
            }
        );
        if (timer) clearTimeout(timer);

        if (!response.ok) {
            const text = await response.text();
            try { metrics.runCodeTotal.labels(language, "failure", "remote").inc(); } catch {}
            return res
                .status(response.status)
                .json({ error: text || "Judge0 error" });
        }

        const data = await response.json();

        // wait=true should return the execution result. If a provider ignores wait,
        // surface a clear retryable error instead of pretending an empty run succeeded.
        if (data?.token && !data?.status) {
            try { metrics.runCodeTotal.labels(language, "failure", "remote").inc(); } catch {}
            return res.status(502).json({ error: "Execution provider returned before the result was ready. Please run again." });
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
        if (isCompilationError) {
            preferredOutput = compileOutputRaw || stderr || message || stdout || "";
        } else if (isRuntimeError) {
            preferredOutput = stderr || message || stdout || "";
        } else {
            preferredOutput = stdout || message || statusDescription || "Execution completed";
        }

        try { metrics.runCodeTotal.labels(language, isError ? "failure" : "success", errorType).inc(); } catch {}
        return res.json({
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
        });
    } catch (err) {
        try { metrics.runCodeTotal.labels(language || "unknown", "failure", "exception").inc(); } catch {}
        const isAbort = (err && (err.name === "AbortError" || /aborted|timeout/i.test(err.message)));
        res.status(isAbort ? 504 : 502).json({ error: isAbort ? "Execution timed out" : (err?.message || "Code execution failed") });
    }
};

export default runCode;
