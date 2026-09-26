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

    const runProject = ({ runtime, files, tests }) => {
        const { project } = getRuntime(runtime);
        const startedAt = Date.now();
        return withWorkspace(workRoot, files, async (workDir) => {
            const compileArgv = project.compile(files);
            if (compileArgv) {
                const compiled = await sandbox.run({ workDir, argv: compileArgv, limits: LIMITS.compile });
                if (compiled.outcome !== "ok") {
                    return { status: compiled.outcome === "timeout" ? "timeout" : "compile_error", compileOutput: joinOutput(compiled), tests: [], durationMs: Date.now() - startedAt };
                }
            }

            const results = [];
            for (const [index, test] of tests.entries()) {
                const remainingSeconds = LIMITS.projectBudgetSeconds - (Date.now() - startedAt) / 1000;
                if (remainingSeconds < 1) { results.push({ name: test.name, passed: false, status: "skipped", output: "Project time budget exhausted." }); continue; }
                const file = files.find((item) => item.path === test.path);
                const limits = { ...LIMITS.test, wallSeconds: Math.max(1, Math.min(LIMITS.test.wallSeconds, Math.floor(remainingSeconds))) };
                let last = null;
                for (const argv of project.testSteps(file, files, index)) {
                    last = await sandbox.run({ workDir, argv, limits });
                    if (last.outcome !== "ok") break;
                }
                const status = last.outcome === "ok" ? "passed" : last.outcome;
                results.push({ name: test.name, passed: status === "passed", status, output: joinOutput(last) });
            }
            return { status: "completed", compileOutput: "", tests: results, durationMs: Date.now() - startedAt };
        });
    };

    return { runSnippet, runProject };
};
