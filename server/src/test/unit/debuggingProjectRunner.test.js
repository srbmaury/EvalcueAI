import { describe, expect, it, vi, beforeEach } from "vitest";

const executeJudge0Submission = vi.fn();
vi.mock("../../utils/runCode.js", () => ({ executeJudge0Submission }));

import { buildDebuggingArchive, runDebuggingProject } from "../../services/debuggingProjectRunner.js";
import { getDebuggingRuntimeProfile } from "../../services/debuggingRuntimeProfiles.js";

const listZipEntries = (buffer) => {
    const names = [];
    for (let offset = 0; offset + 46 <= buffer.length;) {
        if (buffer.readUInt32LE(offset) !== 0x02014b50) {
            offset += 1;
            continue;
        }
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
    { path: "tests/app.test.js", content: "// visible", kind: "visible_test" },
    { path: "hidden/secret.test.js", content: "// hidden", kind: "hidden_test" },
];

describe("debugging project runner", () => {
    beforeEach(() => {
        executeJudge0Submission.mockReset();
        executeJudge0Submission.mockResolvedValue({
            stdout: "__EVALCUE_RESULT__{\"visiblePassed\":1,\"visibleTotal\":1,\"hiddenPassed\":0,\"hiddenTotal\":0,\"visibleFailures\":[]}",
            stderr: "",
            compileOutput: "",
            status: { id: 3, description: "Accepted" },
            isError: false,
            errorType: "none",
        });
    });

    it("provides only trusted runtime profiles", () => {
        expect(getDebuggingRuntimeProfile("node-22")).toMatchObject({ runtime: "node-22" });
        expect(() => getDebuggingRuntimeProfile("custom-shell")).toThrow(/runtime/i);
    });

    it("builds visible-run archives without hidden tests", () => {
        const archive = buildDebuggingArchive({ files, runtime: "node-22", includeHiddenTests: false });
        const entries = listZipEntries(archive);
        expect(entries).toContain("compile");
        expect(entries).toContain("run");
        expect(entries).toContain("src/app.js");
        expect(entries).toContain("tests/app.test.js");
        expect(entries).not.toContain("hidden/secret.test.js");
    });

    it("includes hidden tests only for final execution", () => {
        const archive = buildDebuggingArchive({ files, runtime: "node-22", includeHiddenTests: true });
        expect(listZipEntries(archive)).toContain("hidden/secret.test.js");
    });

    it("submits Judge0 multi-file language 89", async () => {
        await runDebuggingProject({ files, runtime: "node-22", includeHiddenTests: false });
        expect(executeJudge0Submission).toHaveBeenCalledWith(expect.objectContaining({
            language_id: 89,
            additional_files: expect.any(String),
        }), expect.any(Object));
        const payload = executeJudge0Submission.mock.calls[0][0];
        const archive = Buffer.from(payload.additional_files, "base64");
        expect(listZipEntries(archive)).not.toContain("hidden/secret.test.js");
    });

    it("returns only aggregate hidden evidence and visible diagnostics", async () => {
        executeJudge0Submission.mockResolvedValueOnce({
            stdout: "noise\n__EVALCUE_RESULT__{\"visiblePassed\":1,\"visibleTotal\":2,\"hiddenPassed\":3,\"hiddenTotal\":4,\"visibleFailures\":[{\"name\":\"visible checkout\",\"message\":\"expected one charge\"}],\"hiddenFailures\":[{\"name\":\"secret race\",\"message\":\"SECRET_EXPECTED_VALUE\"}]}",
            stderr: "hidden/secret.test.js SECRET_STACK",
            compileOutput: "",
            status: { id: 4, description: "Wrong Answer" },
            isError: false,
            errorType: "none",
        });

        const result = await runDebuggingProject({ files, runtime: "node-22", includeHiddenTests: true });
        expect(result).toEqual({
            status: "failed",
            visiblePassed: 1,
            visibleTotal: 2,
            hiddenPassed: 3,
            hiddenTotal: 4,
            visibleFailures: [{ name: "visible checkout", message: "expected one charge" }],
        });
        expect(JSON.stringify(result)).not.toMatch(/secret race|SECRET|hidden\/secret/i);
    });
});
