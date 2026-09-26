import metrics from "../metrics/index.js";
import { RUNTIME_IDS, SNIPPET_RUNTIMES } from "../config/codeRuntimes.js";

// Client for the sandboxed code runner service (see /runner).
// Successful runtime lists are cached for 5 minutes; failures for 30 seconds so an outage is noticed
// quickly without every capabilities or readiness request waiting on an unreachable runner.
const RUNTIME_CACHE_MS = 5 * 60 * 1000;
const RUNTIME_FAILURE_CACHE_MS = 30 * 1000;
const RUNTIME_TIMEOUT_MS = 3000;
let runtimeCache = { at: 0, ids: null, ttl: 0 };

const runnerError = (message, statusCode = 502) => Object.assign(new Error(message), { statusCode });

export const codeRunnerConfigured = () => Boolean(process.env.CODE_RUNNER_URL && process.env.CODE_RUNNER_TOKEN);

const request = async (path, body, { timeoutMs = Number(process.env.CODE_RUNNER_TIMEOUT_MS) || 90_000 } = {}) => {
    if (!codeRunnerConfigured()) throw runnerError("Code execution is temporarily unavailable", 503);
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

const recordAvailability = (ids) => {
    metrics.componentReady.labels("code_runner").set(ids.length ? 1 : 0);
    for (const runtime of RUNTIME_IDS) metrics.codeRunnerRuntimeAvailable.labels(runtime).set(ids.includes(runtime) ? 1 : 0);
};

// Runtimes whose toolchain passed the runner's startup probe. Empty when the runner is unreachable.
export const availableRuntimeIds = async () => {
    if (!codeRunnerConfigured()) return [];
    if (runtimeCache.ids && Date.now() - runtimeCache.at < runtimeCache.ttl) return runtimeCache.ids;
    let ids = [];
    try {
        const { runtimes = [] } = await request("/v1/runtimes", undefined, { timeoutMs: RUNTIME_TIMEOUT_MS });
        ids = runtimes.map((item) => item.id).filter((id) => RUNTIME_IDS.includes(id));
    } catch { /* reported through metrics and readiness */ }
    runtimeCache = { at: Date.now(), ids, ttl: ids.length ? RUNTIME_CACHE_MS : RUNTIME_FAILURE_CACHE_MS };
    recordAvailability(ids);
    return ids;
};

export const resetRuntimeCache = () => { runtimeCache = { at: 0, ids: null, ttl: 0 }; };

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
