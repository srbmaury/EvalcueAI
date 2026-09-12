import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve("src/pages/AssessmentsPage.jsx"), "utf8");

describe("assessment creation entry points", () => {
    it("routes creation to the guided builder and removes the legacy inline builder", () => {
        expect(source).toContain('const createAssessmentPath = "/hire/assessments?create=1"');
        expect(source.match(/to=\{createAssessmentPath\}/g)?.length || 0).toBeGreaterThanOrEqual(2);
        expect(source).not.toContain("const [showCreate");
        expect(source).not.toContain("<Collapse in={showCreate}");
        expect(source).not.toContain('component="form" onSubmit={create}');
        expect(source).not.toContain("JobPostImporter");
    });
});
