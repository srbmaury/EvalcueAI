import { chown, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { LIMITS } from "./config.js";
import { getRuntime } from "./runtimes.js";

// The sandbox runs as nobody (65534); it must be able to write build output into the job directory.
const SANDBOX_UID = 65534;

const withWorkspace = async (workRoot, files, fn) => {
    const dir = await mkdtemp(path.join(workRoot, "job-"));
    try {
        const dirs = new Set([dir, path.join(dir, ".build")]);
        for (const file of files) {
            let parent = path.dirname(path.join(dir, file.path));
            while (parent.startsWith(dir) && !dirs.has(parent)) { dirs.add(parent); parent = path.dirname(parent); }
        }
        for (const target of [...dirs].sort()) await mkdir(target, { recursive: true });
        for (const file of files) await writeFile(path.join(dir, file.path), file.content);
        if (process.getuid?.() === 0) {
            for (const target of dirs) await chown(target, SANDBOX_UID, SANDBOX_UID);
            for (const file of files) await chown(path.join(dir, file.path), SANDBOX_UID, SANDBOX_UID);
        }
        return await fn(dir);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
};

const joinOutput = (step) => [step.stdout, step.stderr].filter(Boolean).join("\n").slice(0, LIMITS.outputBytes);

export const createJobs = ({ sandbox, workRoot }) => {
    const runSnippet = ({ runtime, source, stdin }) => {
        const { snippet } = getRuntime(runtime);
        const fileName = snippet.fileName(source);
        return withWorkspace(workRoot, [{ path: fileName, content: source }], async (workDir) => {
            let compileOutput = "";
            if (snippet.compile) {
                const compiled = await sandbox.run({ workDir, argv: snippet.compile(fileName), limits: LIMITS.compile });
                compileOutput = joinOutput(compiled);
                if (compiled.outcome !== "ok") {
                    return { status: compiled.outcome === "timeout" ? "timeout" : "compile_error", stdout: "", stderr: "", compileOutput, exitCode: compiled.exitCode, durationMs: compiled.durationMs, truncated: compiled.truncated };
                }
            }
            const ran = await sandbox.run({ workDir, argv: snippet.run(fileName), stdin, limits: LIMITS.run });
            const status = { ok: "ok", failed: "runtime_error", timeout: "timeout", killed: "killed" }[ran.outcome];
            return { status, stdout: ran.stdout, stderr: ran.stderr, compileOutput, exitCode: ran.exitCode, durationMs: ran.durationMs, truncated: ran.truncated };
        });
    };

    const runProject = async ({ runtime, files, tests, entryFile }) => {
        const { project } = getRuntime(runtime);
        const entry = files.find((file) => file.path === entryFile);
        const startedAt = Date.now();
        const results = [];
        for (const test of tests) {
            const remaining = () => Math.floor(LIMITS.projectBudgetSeconds - (Date.now() - startedAt) / 1000);
            if (remaining() < 1) {
                results.push({ name: test.name, passed: false, status: "timeout", output: "" });
                continue;
            }
            const result = await withWorkspace(workRoot, files, async (workDir) => {
                const compile = project.compile(files);
                if (compile) {
                    const built = await sandbox.run({ workDir, argv: compile, limits: { ...LIMITS.compile, wallSeconds: Math.max(1, Math.min(remaining(), LIMITS.compile.wallSeconds)) } });
                    if (built.outcome !== "ok") return { compileFailed: true, status: built.outcome === "timeout" ? "timeout" : "compile_error", output: joinOutput(built) };
                }
                if (remaining() < 1) return { name: test.name, passed: false, status: "timeout", output: "" };
                const ran = await sandbox.run({ workDir, argv: project.entryCommand(entry), stdin: test.stdin, limits: { ...LIMITS.run, wallSeconds: Math.min(remaining(), LIMITS.run.wallSeconds) } });
                const passed = ran.outcome === "ok" && !ran.truncated && ran.stdout.replace(/\r\n/g, "\n").replace(/\n$/, "") === test.stdout.replace(/\r\n/g, "\n").replace(/\n$/, "");
                return { name: test.name, passed, status: passed ? "passed" : ran.outcome === "ok" ? "failed" : ran.outcome, output: joinOutput(ran) };
            });
            if (result.compileFailed) return { status: result.status, compileOutput: result.output, tests: [], durationMs: Date.now() - startedAt };
            results.push(result);
        }
        return { status: "completed", compileOutput: "", tests: results, durationMs: Date.now() - startedAt };
    };

    return { runSnippet, runProject };
};
