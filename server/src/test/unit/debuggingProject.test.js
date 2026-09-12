import { describe, expect, it } from "vitest";
import {
    validateDebuggingProject,
    sanitizeProjectForCandidate,
    applyDebuggingOverlay,
    summarizeDebuggingDiff,
} from "../../services/debuggingProject.js";

describe("debugging project model", () => {
    it("rejects traversal and absolute paths", () => {
        expect(() => validateDebuggingProject([{ path: "../secret", content: "x", kind: "source" }])).toThrow(/path/i);
        expect(() => validateDebuggingProject([{ path: "/etc/passwd", content: "x", kind: "source" }])).toThrow(/path/i);
        expect(() => validateDebuggingProject([{ path: "C:\\secret.txt", content: "x", kind: "source" }])).toThrow(/path/i);
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

    it("removes hidden tests from candidate payloads", () => {
        const files = sanitizeProjectForCandidate([
            { path: "src/a.js", content: "a", kind: "source" },
            { path: "tests/a.test.js", content: "v", kind: "visible_test" },
            { path: "hidden/a.test.js", content: "h", kind: "hidden_test" },
        ]);
        expect(files.map((file) => file.path)).toEqual(["src/a.js", "tests/a.test.js"]);
    });

    it("applies changed created and deleted candidate files without mutating the base", () => {
        const base = [
            { path: "src/a.js", content: "old", kind: "source" },
            { path: "src/b.js", content: "keep", kind: "source" },
        ];
        const overlay = {
            changedFiles: [{ path: "src/a.js", content: "new" }],
            createdFiles: [{ path: "src/c.js", content: "created" }],
            deletedFiles: ["src/b.js"],
        };
        expect(applyDebuggingOverlay(base, overlay).map(({ path, content }) => [path, content])).toEqual([
            ["src/a.js", "new"],
            ["src/c.js", "created"],
        ]);
        expect(base[0].content).toBe("old");
        expect(summarizeDebuggingDiff(base, overlay)).toMatchObject({ changed: 1, created: 1, deleted: 1 });
    });

    it("prevents candidate overlays from changing or deleting hidden tests", () => {
        const base = [{ path: "hidden/secret.test.js", content: "secret", kind: "hidden_test" }];
        expect(() => applyDebuggingOverlay(base, {
            changedFiles: [{ path: "hidden/secret.test.js", content: "tampered" }],
            createdFiles: [],
            deletedFiles: [],
        })).toThrow(/hidden/i);
        expect(() => applyDebuggingOverlay(base, {
            changedFiles: [],
            createdFiles: [],
            deletedFiles: ["hidden/secret.test.js"],
        })).toThrow(/hidden/i);
    });
});
