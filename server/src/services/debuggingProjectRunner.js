import { validateDebuggingProject } from "./debuggingProject.js";
import { runProject } from "./codeRunner.js";

// Failures caused by a broken project (missing module, syntax/compile error) rather than a failing
// assertion. Publishing validation must not treat these as a reproduced bug.
const SETUP_FAILURE = /ERR_MODULE_NOT_FOUND|Cannot find module|SyntaxError|ModuleNotFoundError|ImportError|IndentationError|error: cannot find symbol|fatal error:|undefined reference/;

const testName = (file, index) => String(file.displayName || `Test ${index + 1}`).replace(/[\r\n]+/g, " ").trim().slice(0, 120) || `Test ${index + 1}`;

// Runs the project's hidden tests. Returns only test names and pass/fail: hidden test output never leaves the server.
export const runDebuggingProject = async ({ files, runtime, entryFile }) => {
    const validated = validateDebuggingProject(files).files;
    const hiddenTests = validated.filter((file) => file.kind === "hidden_test");
    const names = hiddenTests.map(testName);
    const invalid = (message) => Object.assign(new Error(message), { statusCode: 400 });
    const sources = validated.filter((file) => file.kind === "source");
    if (!sources.some((file) => file.path === entryFile)) throw invalid("Choose a source entry file for code-fix grading");
    if (!hiddenTests.length || hiddenTests.length > 25) throw invalid("Provide 1–25 hidden input/output test files");
    const cases = hiddenTests.map((file, index) => {
        let fixture;
        try { fixture = JSON.parse(file.content); } catch { throw invalid("Convert executable hidden tests to JSON with stdin and stdout strings"); }
        if (typeof fixture?.stdin !== "string" || typeof fixture?.stdout !== "string" || !fixture.stdout.trim() ||
            Buffer.byteLength(fixture.stdin) > 65536 || Buffer.byteLength(fixture.stdout) > 65536) {
            throw invalid("Each hidden test needs stdin and nonempty stdout strings of at most 64 KiB");
        }
        return { name: names[index], stdin: fixture.stdin, stdout: fixture.stdout };
    });
    const result = await runProject({
        runtime,
        entryFile,
        files: sources.map(({ path, content }) => ({ path, content })),
        tests: cases,
    });

    if (result.status !== "completed") {
        return { status: result.status === "timeout" ? "timeout" : "compile_error", passed: 0, total: names.length, tests: names.map((name) => ({ name, passed: false })), setupErrorCount: 0 };
    }
    const tests = names.map((name, index) => ({ name, passed: result.tests[index]?.passed === true }));
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
