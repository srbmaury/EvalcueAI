import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createJobs } from "../src/jobs.js";

const step = (outcome, extra = {}) => ({ outcome, exitCode: outcome === "ok" ? 0 : 1, stdout: "", stderr: "", truncated: false, durationMs: 5, ...extra });

const fakeSandbox = (outcomes) => {
    const calls = [];
    return { calls, run: async (call) => { calls.push(call); return outcomes.shift() || step("ok"); } };
};

describe("jobs", () => {
    it("reports compile errors without running the snippet", async () => {
        const workRoot = await mkdtemp(path.join(os.tmpdir(), "runner-"));
        const sandbox = fakeSandbox([step("failed", { stderr: "Main.java:1: error" })]);
        const result = await createJobs({ sandbox, workRoot }).runSnippet({ runtime: "java-21", source: "public class Main {", stdin: "" });
        assert.equal(result.status, "compile_error");
        assert.match(result.compileOutput, /error/);
        assert.equal(sandbox.calls.length, 1);
        assert.deepEqual(await readdir(workRoot), [], "job directory is removed");
    });

    it("maps sandbox outcomes to snippet statuses", async () => {
        const workRoot = await mkdtemp(path.join(os.tmpdir(), "runner-"));
        for (const [outcome, status] of [["ok", "ok"], ["failed", "runtime_error"], ["timeout", "timeout"], ["killed", "killed"]]) {
            const result = await createJobs({ sandbox: fakeSandbox([step(outcome)]), workRoot }).runSnippet({ runtime: "python-3", source: "print(1)", stdin: "" });
            assert.equal(result.status, status);
        }
    });

    it("grades stdout outside the sandbox and gives each case a fresh workspace", async () => {
        const workRoot = await mkdtemp(path.join(os.tmpdir(), "runner-"));
        const sandbox = fakeSandbox([step("ok"), step("ok", { stdout: "5\n" })]);
        const files = [{ path: "main.py", content: "import os; os._exit(0)" }];
        const tests = [{ stdin: "2 3", stdout: "5", name: "early exit" }, { stdin: "4 1", stdout: "5", name: "correct" }];
        const result = await createJobs({ sandbox, workRoot }).runProject({ runtime: "python-3", files, entryFile: "main.py", tests });
        assert.deepEqual(result.tests.map((test) => test.passed), [false, true]);
        assert.equal(sandbox.calls[0].stdin, "2 3");
        assert.equal(sandbox.calls[0].stdout, undefined);
        assert.notEqual(sandbox.calls[0].workDir, sandbox.calls[1].workDir);
    });
});
