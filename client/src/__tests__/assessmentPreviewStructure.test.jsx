import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve("src/pages/AssessmentPreviewPage.jsx"), "utf8");

describe("assessment recruiter preview", () => {
    it("does not expose a publish action inside the candidate preview", () => {
        expect(source).not.toContain(">Publish assessment<");
        expect(source).toContain("Recruiter structure preview");
    });
});
