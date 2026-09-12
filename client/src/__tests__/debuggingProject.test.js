import { describe, expect, it } from "vitest";
import {
    addProjectFile,
    addProjectFolder,
    deleteProjectPath,
    deriveDebuggingOverlay,
    normalizeProjectPath,
    renameProjectPath,
} from "../utils/debuggingProject";

describe("debugging project client utilities", () => {
    it("normalizes relative project paths and rejects traversal", () => {
        expect(normalizeProjectPath("src\\service\\Payment.js")).toBe("src/service/Payment.js");
        expect(normalizeProjectPath("../secret.txt")).toBe("");
        expect(normalizeProjectPath("/etc/passwd")).toBe("");
    });

    it("creates files and folders without duplicate paths", () => {
        let files = addProjectFile([], "src/index.js", "source", "buggy");
        files = addProjectFolder(files, "src/services");
        expect(files.map((file) => file.path)).toEqual(["src/index.js", "src/services/.gitkeep"]);
        expect(() => addProjectFile(files, "src/index.js")).toThrow(/already exists/i);
    });

    it("renames and deletes nested project paths", () => {
        const files = [
            { path: "src/services/a.js", content: "a", kind: "source" },
            { path: "src/services/b.js", content: "b", kind: "source" },
        ];
        const renamed = renameProjectPath(files, "src/services", "src/domain");
        expect(renamed.map((file) => file.path)).toEqual(["src/domain/a.js", "src/domain/b.js"]);
        expect(deleteProjectPath(renamed, "src/domain")).toEqual([]);
    });

    it("derives changed created and deleted source overlays while excluding tests", () => {
        const base = [
            { path: "src/a.js", content: "old", kind: "source" },
            { path: "src/b.js", content: "delete me", kind: "source" },
            { path: "tests/a.test.js", content: "test", kind: "visible_test" },
        ];
        const current = [
            { path: "src/a.js", content: "new", kind: "source" },
            { path: "src/c.js", content: "created", kind: "source" },
            { path: "tests/a.test.js", content: "test", kind: "visible_test" },
        ];
        expect(deriveDebuggingOverlay(base, current)).toEqual({
            changedFiles: [{ path: "src/a.js", content: "new" }],
            createdFiles: [{ path: "src/c.js", content: "created" }],
            deletedFiles: ["src/b.js"],
        });
    });
});
