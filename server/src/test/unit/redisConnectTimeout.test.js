import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import promClient from "prom-client";

describe("getRedisClient connect timeout", () => {
    const previousUrl = process.env.REDIS_URL;
    const previousTimeout = process.env.REDIS_CONNECT_TIMEOUT_MS;

    beforeEach(() => {
        promClient.register.clear();
        vi.resetModules();
        process.env.REDIS_URL = "redis://unreachable-host:6379";
        process.env.REDIS_CONNECT_TIMEOUT_MS = "50";
    });

    afterEach(() => {
        if (previousUrl === undefined) delete process.env.REDIS_URL; else process.env.REDIS_URL = previousUrl;
        if (previousTimeout === undefined) delete process.env.REDIS_CONNECT_TIMEOUT_MS; else process.env.REDIS_CONNECT_TIMEOUT_MS = previousTimeout;
        vi.doUnmock("redis");
    });

    it("resolves to null instead of hanging forever when the client's connect() never settles (its reconnectStrategy never gives up)", async () => {
        vi.doMock("redis", () => ({
            createClient: () => {
                const handlers = {};
                return {
                    isOpen: false,
                    isReady: false,
                    on(event, handler) { handlers[event] = handler; return this; },
                    once(event, handler) { handlers[event] = handler; return this; },
                    off() { return this; },
                    // Simulates the real client: connect() never resolves/rejects when the
                    // host is unreachable, because its internal retry loop never gives up.
                    connect: () => new Promise(() => {}),
                };
            },
        }));
        const { getRedisClient } = await import("../../config/redis.js");

        const startedAt = Date.now();
        const result = await getRedisClient();
        const elapsedMs = Date.now() - startedAt;

        expect(result).toBeNull();
        expect(elapsedMs).toBeLessThan(2000); // bounded by REDIS_CONNECT_TIMEOUT_MS=50, not hanging forever
    });

    it("returns the client once it actually becomes ready", async () => {
        let readyHandler;
        vi.doMock("redis", () => ({
            createClient: () => ({
                isOpen: false,
                isReady: false,
                on(event, handler) { if (event === "ready") readyHandler = handler; return this; },
                once(event, handler) { if (event === "ready") readyHandler = handler; return this; },
                off() { return this; },
                connect() {
                    this.isOpen = true;
                    // Simulate a fast, successful connection.
                    setTimeout(() => { this.isReady = true; readyHandler?.(); }, 5);
                    return new Promise(() => {}); // connect() itself still never settles; readiness comes via the event
                },
                sendCommand: async () => ["maxmemory-policy", "noeviction"],
            }),
        }));
        const { getRedisClient } = await import("../../config/redis.js");

        const result = await getRedisClient();
        expect(result).not.toBeNull();
        expect(result.isReady).toBe(true);
    });
});
