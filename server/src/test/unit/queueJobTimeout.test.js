import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    WorkerCtor: vi.fn(function Worker(name, processor) {
        this.name = name;
        this.processor = processor;
        this.on = vi.fn();
        this.close = vi.fn();
    }),
    QueueCtor: vi.fn(function Queue() {
        this.getJobCounts = vi.fn().mockResolvedValue({});
        this.getWaiting = vi.fn().mockResolvedValue([]);
        this.close = vi.fn();
    }),
}));

vi.mock("bullmq", () => ({ default: { Worker: mocks.WorkerCtor, Queue: mocks.QueueCtor } }));
vi.mock("../../config/redis.js", () => ({ default: vi.fn().mockResolvedValue({ isReady: true }) }));
vi.mock("../../metrics/index.js", () => ({ default: new Proxy({}, { get: () => ({ labels: () => ({ inc: vi.fn(), observe: vi.fn(), set: vi.fn() }) }) }) }));
vi.mock("../../metrics/production.js", () => ({ default: new Proxy({}, { get: () => ({ labels: () => ({ inc: vi.fn(), dec: vi.fn(), observe: vi.fn(), set: vi.fn() }) }) }) }));

import { createWorker } from "../../queues/index.js";

describe("createWorker job timeout", () => {
    const previousRedisUrl = process.env.REDIS_URL;
    const previousTimeout = process.env.QUEUE_JOB_TIMEOUT_MS;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.REDIS_URL = "redis://localhost:6379";
    });

    afterEach(() => {
        if (previousRedisUrl === undefined) delete process.env.REDIS_URL; else process.env.REDIS_URL = previousRedisUrl;
        if (previousTimeout === undefined) delete process.env.QUEUE_JOB_TIMEOUT_MS; else process.env.QUEUE_JOB_TIMEOUT_MS = previousTimeout;
    });

    it("rejects a hung processor after QUEUE_JOB_TIMEOUT_MS instead of occupying the worker's slot forever", async () => {
        process.env.QUEUE_JOB_TIMEOUT_MS = "50";
        const hungProcessor = () => new Promise(() => {}); // never resolves
        await createWorker("test-queue", hungProcessor);

        expect(mocks.WorkerCtor).toHaveBeenCalledOnce();
        const wrappedProcessor = mocks.WorkerCtor.mock.calls[0][1];
        expect(wrappedProcessor).not.toBe(hungProcessor); // must be wrapped, not passed straight through

        await expect(wrappedProcessor({ id: "job-1" })).rejects.toThrow(/timed out/i);
    });

    it("still returns the processor's result normally when it finishes well within the timeout", async () => {
        process.env.QUEUE_JOB_TIMEOUT_MS = "5000";
        const fastProcessor = async (job) => ({ ok: true, jobId: job.id });
        await createWorker("test-queue-2", fastProcessor);

        const wrappedProcessor = mocks.WorkerCtor.mock.calls[0][1];
        await expect(wrappedProcessor({ id: "job-2" })).resolves.toEqual({ ok: true, jobId: "job-2" });
    });
});
