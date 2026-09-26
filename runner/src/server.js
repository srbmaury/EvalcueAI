import { mkdir } from "node:fs/promises";
import { loadConfig, LIMITS } from "./config.js";
import { createApp } from "./app.js";
import { createJobs } from "./jobs.js";
import { createMetrics } from "./metrics.js";
import { createQueue } from "./queue.js";
import { RUNTIMES } from "./runtimes.js";
import { createNsjailSandbox } from "./sandbox.js";

const config = loadConfig();
if (config.token.length < 32) {
    console.error("RUNNER_TOKEN must be set to a random value of at least 32 characters.");
    process.exit(1);
}

await mkdir(config.workRoot, { recursive: true });
const sandbox = createNsjailSandbox({ ...config, outputBytes: LIMITS.outputBytes });

// Probe every toolchain inside the real sandbox at startup: a runtime is only offered if it actually runs there.
const available = [];
for (const [id, runtime] of Object.entries(RUNTIMES)) {
    try {
        const result = await sandbox.run({ workDir: config.workRoot, argv: runtime.version, limits: LIMITS.compile });
        const version = `${result.stdout}\n${result.stderr}`.trim().split("\n")[0];
        if (result.outcome === "ok") available.push({ id, label: runtime.label, version });
        else console.error(`[runner] ${id} probe failed:`, result.stderr || result.stdout);
    } catch (error) {
        console.error(`[runner] ${id} probe failed:`, error.message);
    }
}
console.log("[runner] runtimes:", available.map((item) => `${item.id} (${item.version})`).join(", ") || "none");

const app = createApp({
    token: config.token,
    jobs: createJobs({ sandbox, workRoot: config.workRoot }),
    queue: createQueue({ concurrency: config.concurrency, limit: config.queueLimit }),
    runtimes: () => available,
    metrics: createMetrics(),
});
app.listen(config.port, () => console.log(`[runner] listening on :${config.port} with ${config.concurrency} workers`));

const shutdown = () => app.close(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
