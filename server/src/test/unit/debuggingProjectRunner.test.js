import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeJudge0Submission } = vi.hoisted(() => ({ executeJudge0Submission: vi.fn() }));
vi.mock("../../utils/runCode.js", () => ({ executeJudge0Submission }));

import { buildDebuggingArchive, runDebuggingProject } from "../../services/debuggingProjectRunner.js";
import { getDebuggingRuntimeProfile } from "../../services/debuggingRuntimeProfiles.js";

const listZipEntries = (buffer) => {
    const names = [];
    for (let offset = 0; offset + 46 <= buffer.length;) {
        if (buffer.readUInt32LE(offset) !== 0x02014b50) { offset += 1; continue; }
        const nameLength = buffer.readUInt16LE(offset + 28);
        const extraLength = buffer.readUInt16LE(offset + 30);
        const commentLength = buffer.readUInt16LE(offset + 32);
        names.push(buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"));
        offset += 46 + nameLength + extraLength + commentLength;
    }
    return names;
};

const files = [
    { path: "src/app.js", content: "export const add = (a, b) => a + b;", kind: "source" },
    { path: "tests/basic.test.js", content: "// recruiter assertion", kind: "hidden_test", displayName: "adds two values" },
    { path: "tests/duplicate.test.js", content: "// recruiter assertion", kind: "hidden_test", displayName: "prevents duplicate charge" },
];

describe("debugging project runner", () => {
    beforeEach(() => {
        executeJudge0Submission.mockReset();
        executeJudge0Submission.mockResolvedValue({
            stdout: "__EVALCUE_TEST__1|adds two values\n__EVALCUE_TEST__1|prevents duplicate charge\n__EVALCUE_COUNTS__2,2\n",
            stderr: "", compileOutput: "", status: { id: 3, description: "Accepted" }, isError: false, errorType: "none",
        });
    });

    it("provides only trusted runtime profiles", () => {
        expect(getDebuggingRuntimeProfile("node-22")).toMatchObject({ runtime: "node-22" });
        expect(() => getDebuggingRuntimeProfile("custom-shell")).toThrow(/runtime/i);
    });

    it("keeps recruiter test files out when test execution is disabled", () => {
        const archive = buildDebuggingArchive({ files, runtime: "node-22", includeHiddenTests: false });
        const entries = listZipEntries(archive);
        expect(entries).toContain("compile");
        expect(entries).toContain("run");
        expect(entries).toContain("src/app.js");
        expect(entries).not.toContain("tests/basic.test.js");
        expect(entries).not.toContain("tests/duplicate.test.js");
    });

    it("includes recruiter tests for candidate test runs", () => {
        const archive = buildDebuggingArchive({ files, runtime: "node-22", includeHiddenTests: true });
        const entries = listZipEntries(archive);
        expect(entries).toContain("tests/basic.test.js");
        expect(entries).toContain("tests/duplicate.test.js");
    });

    it("submits Judge0 multi-file language 89", async () => {
        await runDebuggingProject({ files, runtime: "node-22", includeHiddenTests: true });
        expect(executeJudge0Submission).toHaveBeenCalledWith(expect.objectContaining({ language_id: 89, additional_files: expect.any(String) }), expect.any(Object));
    });

    it("returns only safe test names and pass fail status", async () => {
        executeJudge0Submission.mockResolvedValueOnce({
            stdout: "__EVALCUE_TEST__1|adds two values\n__EVALCUE_TEST__0|prevents duplicate charge\n__EVALCUE_COUNTS__1,2\n",
            stderr: "tests/duplicate.test.js internal diagnostic", compileOutput: "", status: { id: 4, description: "Wrong Answer" }, isError: false, errorType: "none",
        });
        const result = await runDebuggingProject({ files, runtime: "node-22", includeHiddenTests: true });
        expect(result).toEqual({
            status: "failed", passed: 1, total: 2,
            tests: [{ name: "adds two values", passed: true }, { name: "prevents duplicate charge", passed: false }],
            setupErrorCount: 0,
        });
        expect(JSON.stringify(result)).not.toMatch(/duplicate\.test\.js|internal diagnostic/i);
    });

    it("counts hidden tests that failed because the project could not load", async () => {
        executeJudge0Submission.mockResolvedValueOnce({
            stdout: "__EVALCUE_SETUP_ERROR__\n__EVALCUE_TEST__0|adds two values\n__EVALCUE_TEST__0|prevents duplicate charge\n__EVALCUE_COUNTS__0,2\n",
            stderr: "", compileOutput: "", status: { id: 4, description: "Wrong Answer" }, isError: false, errorType: "none",
        });
        const result = await runDebuggingProject({ files, runtime: "node-22", includeHiddenTests: true });
        expect(result).toMatchObject({ status: "failed", passed: 0, total: 2, setupErrorCount: 1 });
    });
});
