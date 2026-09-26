import os from "node:os";

const positiveInt = (name, fallback) => {
    const value = Number.parseInt(process.env[name] ?? "", 10);
    return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const loadConfig = () => Object.freeze({
    port: positiveInt("PORT", 8080),
    token: process.env.RUNNER_TOKEN || "",
    concurrency: positiveInt("RUNNER_CONCURRENCY", Math.max(1, os.availableParallelism() - 1)),
    queueLimit: positiveInt("RUNNER_QUEUE_LIMIT", 32),
    workRoot: process.env.RUNNER_WORK_DIR || "/var/runner/work",
    nsjailPath: process.env.NSJAIL_PATH || "/usr/local/bin/nsjail",
    nsjailConfig: process.env.NSJAIL_CONFIG || "/etc/runner/nsjail.cfg",
    cgroupRoot: process.env.RUNNER_CGROUP_ROOT || "/sys/fs/cgroup/jails",
});

// Per-step limits. A project job also has an overall budget so a slow test suite can't hold a worker indefinitely.
export const LIMITS = Object.freeze({
    compile: { wallSeconds: 20, memoryMb: 768, pids: 128 },
    run: { wallSeconds: 6, memoryMb: 512, pids: 128 },
    test: { wallSeconds: 10, memoryMb: 512, pids: 128 },
    projectBudgetSeconds: 60,
    outputBytes: 64 * 1024,
    maxSourceBytes: 256 * 1024,
    maxStdinBytes: 64 * 1024,
    maxFiles: 100,
    maxProjectBytes: 2 * 1024 * 1024,
    maxTests: 25,
});
