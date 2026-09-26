import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { createQueue } from "../src/queue.js";

const token = "t".repeat(40);
let server;
let base;

before(async () => {
    const jobs = { runSnippet: async (input) => ({ status: "ok", stdout: input.source }), runProject: async () => ({ status: "completed", tests: [] }) };
    server = createApp({ token, jobs, queue: createQueue({ concurrency: 1, limit: 1 }), runtimes: () => [{ id: "python-3", label: "Python 3.12", version: "Python 3.12" }] });
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
