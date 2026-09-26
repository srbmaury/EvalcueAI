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

    it("runs every test step and stops a test at its first failing step", async () => {
        const workRoot = await mkdtemp(path.join(os.tmpdir(), "runner-"));
        // cpp: compile check, then test 1 (build ok, run fails), then test 2 (build fails, run skipped).
        const sandbox = fakeSandbox([step("ok"), step("ok"), step("failed", { stdout: "assert" }), step("failed", { stderr: "error: x" })]);
        const files = [{ path: "a.cpp", content: "", test: false }, { path: "t1.cpp", content: "", test: true }, { path: "t2.cpp", content: "", test: true }];
        const result = await createJobs({ sandbox, workRoot }).runProject({ runtime: "cpp-20", files, tests: [{ path: "t1.cpp", name: "one" }, { path: "t2.cpp", name: "two" }] });
        assert.equal(result.status, "completed");
        assert.deepEqual(result.tests.map((test) => [test.name, test.passed, test.status]), [["one", false, "failed"], ["two", false, "failed"]]);
        assert.equal(result.tests[1].output, "error: x");
        assert.equal(sandbox.calls.length, 4);
    });
});
