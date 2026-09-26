import { validateDebuggingProject } from "./debuggingProject.js";
import { runProject } from "./codeRunner.js";

// Failures caused by a broken project (missing module, syntax/compile error) rather than a failing
// assertion. Publishing validation must not treat these as a reproduced bug.
const SETUP_FAILURE = /ERR_MODULE_NOT_FOUND|Cannot find module|SyntaxError|ModuleNotFoundError|ImportError|IndentationError|error: cannot find symbol|fatal error:|undefined reference/;

const testName = (file, index) => String(file.displayName || `Test ${index + 1}`).replace(/[\r\n]+/g, " ").trim().slice(0, 120) || `Test ${index + 1}`;

// Runs the project's hidden tests. Returns only test names and pass/fail: hidden test output never leaves the server.
export const runDebuggingProject = async ({ files, runtime }) => {
    const validated = validateDebuggingProject(files).files;
    const hiddenTests = validated.filter((file) => file.kind === "hidden_test");
    const names = hiddenTests.map(testName);
    const result = await runProject({
        runtime,
        files: validated.map((file) => ({ path: file.path, content: file.content })),
        tests: hiddenTests.map((file, index) => ({ path: file.path, name: names[index] })),
    });

    if (result.status !== "completed") {
        return { status: result.status === "timeout" ? "timeout" : "compile_error", passed: 0, total: names.length, tests: names.map((name) => ({ name, passed: false })), setupErrorCount: 0 };
    }
    const tests = result.tests.map((test, index) => ({ name: names[index], passed: Boolean(test.passed) }));
    const passed = tests.filter((test) => test.passed).length;
    const failed = result.tests.filter((test) => !test.passed);
    return {
        status: passed === tests.length ? "passed" : failed.some((test) => test.status === "timeout") ? "timeout" : "failed",
        passed,
        total: tests.length,
        tests,
        setupErrorCount: failed.filter((test) => SETUP_FAILURE.test(test.output || "")).length,
    };
};
