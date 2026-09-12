import { executeCode } from "../utils/runCode.js";

const normalizeOutput = (value) => String(value || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .trimEnd();

export const runDebuggingTests = async ({ language, code, tests = [] }) => {
    const summary = {
        passed: 0,
        total: tests.length,
        visible: [],
        hiddenPassed: 0,
        hiddenTotal: tests.filter((test) => test.hidden).length,
    };

    for (const test of tests) {
        const result = await executeCode({ language, code, stdin: test.stdin || "" });
        if (result?.isError) {
            const kind = result.errorType && result.errorType !== "none" ? result.errorType : "execution";
            const message = result.compileOutput || result.stderr || result.output || result.message || "Code execution failed";
            throw new Error(`${kind} execution failed: ${message}`);
        }

        const passed = normalizeOutput(result?.stdout ?? result?.output) === normalizeOutput(test.expectedOutput);
        if (passed) summary.passed += 1;

        if (test.hidden) {
            if (passed) summary.hiddenPassed += 1;
            continue;
        }

        summary.visible.push({
            name: test.name,
            passed,
            output: result?.stdout ?? result?.output ?? "",
        });
    }

    return summary;
};

export { normalizeOutput };
