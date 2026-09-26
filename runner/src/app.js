import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { parseProject, parseSnippet } from "./validate.js";
import { runtimeIds } from "./runtimes.js";

const MAX_BODY_BYTES = 3 * 1024 * 1024;

const send = (res, status, body, contentType = "application/json") => {
    const payload = typeof body === "string" ? body : JSON.stringify(body);
    res.writeHead(status, { "content-type": contentType, "content-length": Buffer.byteLength(payload) });
    res.end(payload);
};

const authorized = (req, token) => {
    const header = req.headers.authorization || "";
    const expected = Buffer.from(`Bearer ${token}`);
    const actual = Buffer.from(header);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
};

const readJson = (req) => new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) { reject(Object.assign(new Error("Request body too large"), { statusCode: 413 })); req.destroy(); return; }
        chunks.push(chunk);
    });
    req.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch { reject(Object.assign(new Error("Invalid JSON"), { statusCode: 400 })); }
    });
    req.on("error", reject);
});

// Routes:
//   GET  /healthz           no auth; 503 when no runtime passed its startup probe
//   GET  /metrics           Prometheus metrics
//   GET  /v1/runtimes       runtimes whose toolchain passed the startup probe
//   POST /v1/snippets       { runtime, source, stdin } -> compile and run one file
//   POST /v1/projects       { runtime, files, tests } -> compile a project and run each test file
export const createApp = ({ token, jobs, queue, runtimes, metrics }) => createServer(async (req, res) => {
    try {
        if (req.method === "GET" && req.url === "/healthz") {
            const ok = runtimes().length > 0;
            return send(res, ok ? 200 : 503, { ok, runtimes: runtimes().length, ...queue.stats() });
        }
        if (!authorized(req, token)) return send(res, 401, { error: "Unauthorized" });

        if (req.method === "GET" && req.url === "/v1/runtimes") return send(res, 200, { runtimes: runtimes() });
        if (req.method === "GET" && req.url === "/metrics") {
            const text = metrics.render({ queue: queue.stats(), runtimeIds: runtimeIds(), available: runtimes().map((item) => item.id) });
            return send(res, 200, text, "text/plain; version=0.0.4");
        }

        const route = req.method === "POST" && { "/v1/snippets": ["snippet", parseSnippet, jobs.runSnippet], "/v1/projects": ["project", parseProject, jobs.runProject] }[req.url];
        if (!route) return send(res, 404, { error: "Not found" });
        const [kind, parse, run] = route;
        const input = parse(await readJson(req));
        if (!runtimes().some((item) => item.id === input.runtime)) return send(res, 503, { error: `Runtime ${input.runtime} is unavailable on this runner` });
        const startedAt = process.hrtime.bigint();
        const result = await queue.push(() => run(input));
        metrics.observeJob({ kind, runtime: input.runtime, status: result.status, seconds: Number(process.hrtime.bigint() - startedAt) / 1e9 });
        return send(res, 200, result);
    } catch (error) {
        const status = error?.statusCode || 500;
        if (status === 429) metrics.observeRejected();
        if (status >= 500) console.error("[runner]", error);
        return send(res, status, { error: status >= 500 ? "Execution failed" : error.message });
    }
});
