import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseProject, parseSnippet, safeRelativePath } from "../src/validate.js";

describe("request validation", () => {
    it("accepts nested relative paths and rejects escapes", () => {
        assert.equal(safeRelativePath("src/main/App.java"), "src/main/App.java");
        for (const bad of ["../x", "/etc/passwd", "a/../../b", "a\\b", "", "a/./b", ".build/x", "a;rm -rf"]) {
            assert.throws(() => safeRelativePath(bad), /Invalid file path/, bad);
        }
    });

    it("requires a known runtime and bounded input", () => {
        assert.throws(() => parseSnippet({ runtime: "ruby", source: "puts 1" }), /Unsupported runtime/);
        assert.throws(() => parseSnippet({ runtime: "python-3", source: "  " }), /source is required/);
        assert.throws(() => parseSnippet({ runtime: "python-3", source: "x".repeat(300 * 1024) }), /too large/);
        assert.deepEqual(parseSnippet({ runtime: "python-3", source: "print(1)" }), { runtime: "python-3", source: "print(1)", stdin: "" });
    });

    it("marks test files and requires tests to exist in the project", () => {
        const input = { runtime: "node-22", files: [{ path: "a.js", content: "" }, { path: "a.test.js", content: "" }], tests: [{ path: "a.test.js", name: "a" }] };
        const parsed = parseProject(input);
        assert.deepEqual(parsed.files.map((file) => file.test), [false, true]);
        assert.throws(() => parseProject({ ...input, tests: [{ path: "missing.test.js" }] }), /not in the project/);
        assert.throws(() => parseProject({ ...input, files: [...input.files, { path: "a.js", content: "" }] }), /Duplicate/);
    });
});
