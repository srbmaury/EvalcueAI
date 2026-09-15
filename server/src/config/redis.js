import { createClient } from "redis";
import productionMetrics from "../metrics/production.js";

let client = null;
let initializing = false;
let policyChecked = false;
let healthTimer = null;

const startHealthSampler = () => {
    if (healthTimer) return;
    const intervalMs = Math.max(Number(process.env.REDIS_HEALTHCHECK_INTERVAL_MS || 30000), 5000);
    const sample = async () => {
        if (!client?.isReady) {
            productionMetrics.redisConnectionReady.set(0);
            return;
        }
        const startedAt = process.hrtime.bigint();
        try {
            await client.ping();
            productionMetrics.redisConnectionReady.set(1);
            productionMetrics.redisPingDurationSeconds.labels("success").observe(Number(process.hrtime.bigint() - startedAt) / 1e9);
        } catch {
            productionMetrics.redisConnectionReady.set(0);
            productionMetrics.redisPingDurationSeconds.labels("failure").observe(Number(process.hrtime.bigint() - startedAt) / 1e9);
        }
    };
    sample();
    healthTimer = setInterval(sample, intervalMs);
    healthTimer.unref?.();
};

// The client's own reconnectStrategy (below) always returns a backoff delay and never a
// "give up" signal, so its connect()/reconnect loop retries forever and never settles on
// its own when Redis is unreachable. Race it against a bounded wait for the "ready" event
// instead of awaiting it directly, so a caller degrades gracefully (this function returns
// null) instead of hanging forever — every route gated by getRedisClient() (quotas, rate
// limiting) would otherwise hang indefinitely whenever Redis is unreachable.
const waitForReady = (c, timeoutMs) => new Promise((resolve) => {
    if (c.isReady) { resolve(true); return; }
    let settled = false;
    const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        c.off("ready", onReady);
        resolve(value);
    };
    const onReady = () => finish(true);
    c.once("ready", onReady);
    const timer = setTimeout(() => finish(false), timeoutMs);
    timer.unref?.();
});

const ensureNoEvictionPolicy = async (c) => {
    if (!c || policyChecked) return;
    try {
        // CONFIG GET returns [key, value]
        const res = await c.sendCommand(["CONFIG", "GET", "maxmemory-policy"]);
        const current = Array.isArray(res) ? (res[1] || "").toString().toLowerCase() : "";
        if (current && current !== "noeviction") {
            try {
                await c.sendCommand(["CONFIG", "SET", "maxmemory-policy", "noeviction"]);
                console.log("[Redis] maxmemory-policy set to noeviction (was:", current, ")");
            } catch (e) {
                console.warn("[Redis] Unable to set maxmemory-policy to noeviction:", e?.message || e);
            }
        }
    } catch (e) {
        // CONFIG may be disabled on managed services; log and continue
        console.warn("[Redis] Could not verify eviction policy:", e?.message || e);
    } finally {
        policyChecked = true;
    }
};

export const getRedisClient = async () => {
    try {
        if (client && client.isReady) return client;
        const url = process.env.REDIS_URL;
        if (!url) return null;
        const connectTimeoutMs = Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 15000);
        if (!client) {
            const retryBaseMs = Number(process.env.REDIS_RETRY_BASE_MS || 500);
            const retryMaxMs = Number(process.env.REDIS_RETRY_MAX_MS || 30000);
            client = createClient({
                url,
                socket: {
                    connectTimeout: connectTimeoutMs,
                    reconnectStrategy: (retries) => {
                        try {
                            const delay = Math.min(retryBaseMs * Math.pow(2, retries), retryMaxMs);
                            return delay;
                        } catch {
                            return retryBaseMs;
                        }
                    },
                },
            });
            client.on("ready", () => productionMetrics.redisConnectionReady.set(1));
            client.on("end", () => productionMetrics.redisConnectionReady.set(0));
            client.on("reconnecting", () => {
                productionMetrics.redisConnectionReady.set(0);
                productionMetrics.redisReconnectsTotal.inc();
            });
            client.on("error", (err) => {
                console.warn("Redis client error:", err?.message || err);
            });
            startHealthSampler();
        }
        if (!client.isOpen && !initializing) {
            initializing = true;
            try {
                await Promise.race([client.connect().catch(() => {}), waitForReady(client, connectTimeoutMs)]);
            } finally {
                initializing = false;
            }
        } else if (!client.isReady) {
            // A connect/reconnect attempt is already under way in the background (its
            // strategy never gives up on its own); wait up to the same budget for it to
            // become ready rather than blocking this caller indefinitely.
            await waitForReady(client, connectTimeoutMs);
        }
        if (client.isReady) await ensureNoEvictionPolicy(client);
        return client.isReady ? client : null;
    } catch (e) {
        productionMetrics.redisConnectionReady.set(0);
        return null;
    }
};

export default getRedisClient;
