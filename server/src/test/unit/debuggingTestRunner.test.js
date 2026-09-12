import { beforeEach, describe, expect, it, vi } from "vitest";

const executeCode = vi.fn();
vi.mock("../../utils/runCode.js", () => ({ executeCode }));

const { runDebuggingTests } = await import("../../services/debuggingTestRunner.js");

const visible = (name, stdin, expectedOutput) => ({ name, stdin, expectedOutput, hidden: false });
const hidden = (name, stdin, expectedOutput) => ({ name, stdin, expectedOutput, hidden: true });

describe("debugging test runner", () => {
    beforeEach(() => vi.clearAllMocks());

    it("reports visible results and only aggregate counts for hidden tests", async () => {
        executeCode
            .mockResolvedValueOnce({ stdout: "2\n", output: "2\n", isError: false })
            .mockResolvedValueOnce({ stdout: "WRONG\n", output: "WRONG\n", isError: false })
            .mockResolvedValueOnce({ stdout: "secret-pass\n", output: "secret-pass\n", isError: false });

        const result = await runDebuggingTests({
            language: "javascript",
            code: "console.log('candidate code')",
            tests: [
                visible("increments", "1", "2"),
                hidden("secret boundary", "99", "EXPECTED-SECRET"),
                hidden("secret success", "100", "secret-pass"),
            ],
        });

        expect(result).toMatchObject({
            passed: 2,
            total: 3,
            hiddenPassed: 1,
            hiddenTotal: 2,
            visible: [{ name: "increments", passed: true, output: "2\n" }],
        });
        expect(executeCode).toHaveBeenCalledTimes(3);
        const serialized = JSON.stringify(result);
        expect(serialized).not.toContain("secret boundary");
        expect(serialized).not.toContain("secret success");
        expect(serialized).not.toContain("EXPECTED-SECRET");
        expect(serialized).not.toContain("99");
    });

    it("normalizes CRLF and trailing whitespace before comparing output", async () => {
        executeCode.mockResolvedValue({ stdout: "line one\r\nline two   \r\n", output: "", isError: false });

        const result = await runDebuggingTests({
            language: "python",
            code: "print('candidate')",
            tests: [visible("multiline", "", "line one\nline two")],
        });

        expect(result.passed).toBe(1);
        expect(result.visible[0].passed).toBe(true);
    });

    it("surfaces execution failures instead of misreporting them as failed assertions", async () => {
        executeCode.mockResolvedValue({
            stdout: "",
            output: "SyntaxError: unexpected token",
            isError: true,
            errorType: "compile",
        });

        await expect(runDebuggingTests({
            language: "javascript",
            code: "broken {",
            tests: [visible("compiles", "", "ok")],
        })).rejects.toThrow(/compile|execution/i);
    });
});
