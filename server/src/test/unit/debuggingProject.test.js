import { describe, expect, it } from "vitest";
import {
    validateDebuggingProject,
    sanitizeProjectForCandidate,
    applyDebuggingOverlay,
    summarizeDebuggingDiff,
} from "../../services/debuggingProject.js";

describe("debugging project model", () => {
    it("rejects traversal and absolute paths", () => {
        expect(() => validateDebuggingProject([{ path: "../outside.txt", content: "x", kind: "source" }])).toThrow(/path/i);
        expect(() => validateDebuggingProject([{ path: "/outside.txt", content: "x", kind: "source" }])).toThrow(/path/i);
        expect(() => validateDebuggingProject([{ path: "D:\\outside.txt", content: "x", kind: "source" }])).toThrow(/path/i);
    });

    it("enforces file and byte limits", () => {
        expect(() => validateDebuggingProject(Array.from({ length: 101 }, (_, i) => ({ path: `src/${i}.js`, content: "x", kind: "source" })))).toThrow(/100 files/i);
        expect(() => validateDebuggingProject([{ path: "huge.js", content: "x".repeat(256 * 1024 + 1), kind: "source" }])).toThrow(/256 KB/i);
        const tooLarge = Array.from({ length: 9 }, (_, i) => ({ path: `src/${i}.txt`, content: "x".repeat(240 * 1024), kind: "source" }));
        expect(() => validateDebuggingProject(tooLarge)).toThrow(/2 MB/i);
    });

    it("normalizes slashes and rejects duplicate normalized paths", () => {
        const result = validateDebuggingProject([{ path: "src\\app.js", content: "x", kind: "source" }]);
        expect(result.files[0].path).toBe("src/app.js");
        expect(() => validateDebuggingProject([
            { path: "src/app.js", content: "a", kind: "source" },
            { path: "src\\app.js", content: "b", kind: "source" },
        ])).toThrow(/duplicate/i);
    });

    it("supports source and hidden-test files only and removes tests from candidate payloads", () => {
        expect(() => validateDebuggingProject([
            { path: "src/a.js", content: "a", kind: "source" },
            { path: "tests/a.test.js", content: "test", kind: "visible_test" },
        ])).toThrow(/kind|unsupported/i);
        const validated = validateDebuggingProject([
            { path: "src/a.js", content: "a", kind: "source" },
            { path: "tests/a.test.js", content: "test", kind: "hidden_test", displayName: "handles request" },
        ]).files;
        expect(validated[1]).toMatchObject({ kind: "hidden_test", displayName: "handles request" });
        expect(sanitizeProjectForCandidate(validated)).toEqual([{ path: "src/a.js", content: "a", kind: "source" }]);
    });

    it("applies changed created and deleted candidate files without mutating the base", () => {
        const base = [
            { path: "src/a.js", content: "old", kind: "source" },
            { path: "src/b.js", content: "keep", kind: "source" },
        ];
        const overlay = { changedFiles: [{ path: "src/a.js", content: "new" }], createdFiles: [{ path: "src/c.js", content: "created" }], deletedFiles: ["src/b.js"] };
        expect(applyDebuggingOverlay(base, overlay).map(({ path, content }) => [path, content])).toEqual([["src/a.js", "new"], ["src/c.js", "created"]]);
        expect(base[0].content).toBe("old");
        expect(summarizeDebuggingDiff(base, overlay)).toMatchObject({ changed: 1, created: 1, deleted: 1 });
    });

    it("prevents candidate overlays from changing or deleting recruiter tests", () => {
        const base = [{ path: "tests/internal.test.js", content: "internal", kind: "hidden_test", displayName: "protected behavior" }];
        expect(() => applyDebuggingOverlay(base, { changedFiles: [{ path: "tests/internal.test.js", content: "changed" }], createdFiles: [], deletedFiles: [] })).toThrow(/hidden/i);
        expect(() => applyDebuggingOverlay(base, { changedFiles: [], createdFiles: [], deletedFiles: ["tests/internal.test.js"] })).toThrow(/hidden/i);
    });
});
