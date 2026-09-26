import { beforeEach, describe, expect, it, vi } from "vitest";

const { runProject } = vi.hoisted(() => ({ runProject: vi.fn() }));
vi.mock("../../services/codeRunner.js", () => ({ runProject }));

import { runDebuggingProject } from "../../services/debuggingProjectRunner.js";

const files = [
    { path: "src/sum.js", kind: "source", content: "export const sum = (a, b) => a - b;" },
    { path: "test/sum.test.js", kind: "hidden_test", displayName: "adds numbers", content: "secret assertions" },
    { path: "test/zero.test.js", kind: "hidden_test", displayName: "", content: "more secrets" },
];

describe("debugging project runner", () => {
    beforeEach(() => runProject.mockReset());

    it("sends the project and names each hidden test", async () => {
        runProject.mockResolvedValue({ status: "completed", tests: [{ passed: true, status: "passed" }, { passed: true, status: "passed" }] });
        await runDebuggingProject({ files, runtime: "node-22" });
        expect(runProject).toHaveBeenCalledWith({
            runtime: "node-22",
            files: files.map(({ path, content }) => ({ path, content })),
            tests: [{ path: "test/sum.test.js", name: "adds numbers" }, { path: "test/zero.test.js", name: "Test 2" }],
        });
    });

    it("returns names and pass/fail only, never hidden test output", async () => {
        runProject.mockResolvedValue({ status: "completed", tests: [{ passed: false, status: "failed", output: "expected 5, got -1 (secret assertions)" }, { passed: true, status: "passed", output: "" }] });
        const result = await runDebuggingProject({ files, runtime: "node-22" });
        expect(result).toEqual({ status: "failed", passed: 1, total: 2, tests: [{ name: "adds numbers", passed: false }, { name: "Test 2", passed: true }], setupErrorCount: 0 });
        expect(JSON.stringify(result)).not.toMatch(/secret|expected 5/);
    });

    it("counts tests that failed because the project could not load", async () => {
        runProject.mockResolvedValue({ status: "completed", tests: [{ passed: false, status: "failed", output: "Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/work/src/summ.js'" }, { passed: false, status: "failed", output: "AssertionError" }] });
        const result = await runDebuggingProject({ files, runtime: "node-22" });
        expect(result.setupErrorCount).toBe(1);
    });

    it("maps compile errors and timeouts", async () => {
        runProject.mockResolvedValueOnce({ status: "compile_error", compileOutput: "error", tests: [] });
        expect(await runDebuggingProject({ files, runtime: "java-21" })).toMatchObject({ status: "compile_error", passed: 0, total: 2 });
        runProject.mockResolvedValueOnce({ status: "completed", tests: [{ passed: false, status: "timeout" }, { passed: true, status: "passed" }] });
        expect((await runDebuggingProject({ files, runtime: "node-22" })).status).toBe("timeout");
    });
});
