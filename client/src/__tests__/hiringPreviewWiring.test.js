import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve("src/pages/AssessmentPreviewPage.jsx"), "utf8");

describe("hiring preview controls", () => {
    it("keeps publishing out of the candidate structure preview", () => {
        expect(source).toContain("Recruiter structure preview");
        expect(source).not.toContain("Publish assessment");
    });
});
