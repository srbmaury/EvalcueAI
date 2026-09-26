import { spawn } from "node:child_process";

// Collects a stream up to `limit` bytes but keeps draining it, so a chatty program can't block on a full pipe.
const capture = (stream, limit) => {
    const chunks = [];
    let size = 0;
    let truncated = false;
    stream.on("data", (chunk) => {
        if (size >= limit) { truncated = true; return; }
        const room = limit - size;
        if (chunk.length > room) truncated = true;
        chunks.push(chunk.subarray(0, room));
        size += Math.min(chunk.length, room);
    });
    return () => ({ text: Buffer.concat(chunks).toString("utf8"), truncated });
};

// Runs one command inside nsjail: no network, fresh namespaces, uid nobody, the job directory mounted at /work,
// and cgroup limits for memory, processes and CPU. Returns how the command ended; never throws for program errors.
export const createNsjailSandbox = ({ nsjailPath, nsjailConfig, cgroupRoot, outputBytes }) => ({
    run: ({ workDir, argv, stdin = "", limits }) => new Promise((resolve, reject) => {
        const args = [
            "--config", nsjailConfig,
            "--bindmount", `${workDir}:/work`,
            "--cwd", "/work",
            "--time_limit", String(limits.wallSeconds),
            "--rlimit_cpu", String(limits.wallSeconds + 1),
            "--use_cgroupv2",
            "--cgroupv2_mount", cgroupRoot,
            "--cgroup_mem_max", String(limits.memoryMb * 1024 * 1024),
            "--cgroup_pids_max", String(limits.pids),
            "--cgroup_cpu_ms_per_sec", "1000",
            "--log_fd", "3",
            "--",
            // nsjail execs without a PATH lookup; env resolves the command against the sandbox's PATH.
            "/usr/bin/env", ...argv,
        ];
        const startedAt = process.hrtime.bigint();
        const child = spawn(nsjailPath, args, { stdio: ["pipe", "pipe", "pipe", "pipe"] });
        const stdout = capture(child.stdout, outputBytes);
        const stderr = capture(child.stderr, outputBytes);
        const log = capture(child.stdio[3], 16 * 1024);
        // nsjail enforces the time limit itself; this only guards against nsjail hanging.
        const guard = setTimeout(() => child.kill("SIGKILL"), (limits.wallSeconds + 5) * 1000);

        child.on("error", (error) => { clearTimeout(guard); reject(error); });
        child.stdin.on("error", () => {});
        child.stdin.end(stdin);
        child.on("close", (code, signal) => {
            clearTimeout(guard);
            const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
            const out = stdout();
            const err = stderr();
            const exitCode = code ?? 137;
            // Wall-clock limit (nsjail log), CPU rlimit (SIGXCPU = 128 + 24), or our guard killing nsjail itself.
            const timedOut = /time limit/i.test(log().text) || exitCode === 152 || signal === "SIGKILL";
            resolve({
                outcome: exitCode === 0 ? "ok" : timedOut ? "timeout" : exitCode > 128 ? "killed" : "failed",
                exitCode,
                stdout: out.text,
                stderr: err.text,
                truncated: out.truncated || err.truncated,
                durationMs: Math.round(durationMs),
            });
        });
    }),
});
