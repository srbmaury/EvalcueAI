import metrics from "../metrics/index.js";
import { RUNTIME_IDS, SNIPPET_RUNTIMES } from "../config/codeRuntimes.js";

// Client for the sandboxed code runner service (see /runner).
const RUNTIME_CACHE_MS = 5 * 60 * 1000;
let runtimeCache = { at: 0, ids: null };

const runnerError = (message, statusCode = 502) => Object.assign(new Error(message), { statusCode });

export const codeRunnerConfigured = () => Boolean(process.env.CODE_RUNNER_URL && process.env.CODE_RUNNER_TOKEN);

const request = async (path, body) => {
    if (!codeRunnerConfigured()) throw runnerError("Code execution is temporarily unavailable", 503);
    const timeoutMs = Number(process.env.CODE_RUNNER_TIMEOUT_MS) || 90_000;
    let response;
    try {
        response = await fetch(new URL(path, process.env.CODE_RUNNER_URL), {
            method: body ? "POST" : "GET",
            headers: { authorization: `Bearer ${process.env.CODE_RUNNER_TOKEN}`, "content-type": "application/json" },
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(timeoutMs),
        });
    } catch (error) {
        const timedOut = error?.name === "TimeoutError";
        throw runnerError(timedOut ? "Code execution timed out" : "Code runner is unreachable", timedOut ? 504 : 503);
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw runnerError(data?.error || "Code execution failed", response.status === 429 ? 429 : response.status >= 500 ? 503 : 502);
    return data;
};

// Runtimes whose toolchain passed the runner's startup probe. Cached; empty when the runner is not reachable.
export const availableRuntimeIds = async () => {
    if (!codeRunnerConfigured()) return [];
    if (runtimeCache.ids && Date.now() - runtimeCache.at < RUNTIME_CACHE_MS) return runtimeCache.ids;
    try {
        const { runtimes = [] } = await request("/v1/runtimes");
        const ids = runtimes.map((item) => item.id).filter((id) => RUNTIME_IDS.includes(id));
        runtimeCache = { at: Date.now(), ids };
        return ids;
    } catch {
        return [];
    }
};

export const resetRuntimeCache = () => { runtimeCache = { at: 0, ids: null }; };

// Compiles and runs one file. Returns the shape the editor's output panel renders.
export const runSnippet = async ({ language, code, stdin = "" }) => {
    const runtime = SNIPPET_RUNTIMES[language];
    if (!runtime || !code) throw runnerError("Missing language or code", 400);
    try {
        const result = await request("/v1/snippets", { runtime, source: code, stdin });
        const errorType = { compile_error: "compile", runtime_error: "runtime", timeout: "timeout", killed: "runtime" }[result.status] || "none";
        const isError = errorType !== "none";
        const output = errorType === "compile" ? result.compileOutput
            : errorType === "timeout" ? `${result.stdout || ""}\nTime limit exceeded.`.trim()
            : result.status === "killed" ? `${result.stderr || ""}\nProcess was killed (memory or process limit exceeded).`.trim()
            : isError ? result.stderr || result.stdout : result.stdout;
        metrics.runCodeTotal.labels(language, isError ? "failure" : "success", errorType).inc();
        return {
            status: result.status,
            output: output || (isError ? "" : "Execution completed"),
            stdout: result.stdout,
            stderr: result.stderr,
            compileOutput: result.compileOutput,
            isError,
            errorType,
            time: result.durationMs / 1000,
            truncated: Boolean(result.truncated),
        };
    } catch (error) {
        metrics.runCodeTotal.labels(language, "failure", "exception").inc();
        throw error;
    }
};

// Compiles a multi-file project and runs each test file. Test output is returned for server-side
// classification only; callers must not expose it to candidates because it can reveal hidden tests.
export const runProject = ({ runtime, files, tests }) => request("/v1/projects", { runtime, files, tests });
