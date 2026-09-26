import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { createMetrics } from "../src/metrics.js";
import { createQueue } from "../src/queue.js";

const token = "t".repeat(40);
let server;
let base;
let available = [{ id: "python-3", label: "Python 3.12", version: "Python 3.12" }];

before(async () => {
    const jobs = { runSnippet: async (input) => ({ status: "ok", stdout: input.source }), runProject: async () => ({ status: "completed", tests: [] }) };
    server = createApp({ token, jobs, queue: createQueue({ concurrency: 1, limit: 1 }), runtimes: () => available, metrics: createMetrics() });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const call = (path, { auth = token, body } = {}) => fetch(`${base}${path}`, {
    method: body ? "POST" : "GET",
    headers: { ...(auth ? { authorization: `Bearer ${auth}` } : {}), "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
});

describe("http api", () => {
    it("serves health without auth but everything else requires the token", async () => {
        assert.equal((await call("/healthz", { auth: null })).status, 200);
        assert.equal((await call("/v1/runtimes", { auth: null })).status, 401);
        assert.equal((await call("/v1/runtimes", { auth: "wrong" })).status, 401);
        assert.deepEqual((await (await call("/v1/runtimes")).json()).runtimes.map((item) => item.id), ["python-3"]);
    });

    it("validates input and refuses runtimes that failed their probe", async () => {
        assert.equal((await call("/v1/snippets", { body: { runtime: "python-3", source: "" } })).status, 400);
        assert.equal((await call("/v1/snippets", { body: { runtime: "node-22", source: "1" } })).status, 503);
        const ok = await call("/v1/snippets", { body: { runtime: "python-3", source: "print(1)" } });
        assert.deepEqual(await ok.json(), { status: "ok", stdout: "print(1)" });
    });
});

describe("health and metrics", () => {
    it("reports unhealthy when no runtime passed its probe", async () => {
        assert.equal((await call("/healthz", { auth: null })).status, 200);
        const saved = available;
        available = [];
        try {
            const response = await call("/healthz", { auth: null });
            assert.equal(response.status, 503);
            assert.equal((await response.json()).runtimes, 0);
        } finally { available = saved; }
    });

    it("exposes job, queue and runtime metrics behind the token", async () => {
        assert.equal((await call("/metrics", { auth: null })).status, 401);
        await call("/v1/snippets", { body: { runtime: "python-3", source: "print(2)" } });
        const text = await (await call("/metrics")).text();
        assert.match(text, /runner_jobs_total\{kind="snippet",runtime="python-3",status="ok"\} \d+/);
        assert.match(text, /runner_job_duration_seconds_count\{kind="snippet",runtime="python-3"\} \d+/);
        assert.match(text, /runner_runtime_available\{runtime="python-3"\} 1/);
        assert.match(text, /runner_runtime_available\{runtime="java-21"\} 0/);
        assert.match(text, /runner_queue_jobs\{state="active"\} 0/);
    });
});

describe("queue", () => {
    it("limits concurrency and rejects when the waiting line is full", async () => {
        const queue = createQueue({ concurrency: 1, limit: 1 });
        let release;
        const first = queue.push(() => new Promise((resolve) => { release = resolve; }));
        const second = queue.push(async () => "second");
        await assert.rejects(queue.push(async () => "third"), { statusCode: 429 });
        assert.deepEqual(queue.stats(), { active: 1, waiting: 1 });
        release("first");
        assert.deepEqual(await Promise.all([first, second]), ["first", "second"]);
    });
});
