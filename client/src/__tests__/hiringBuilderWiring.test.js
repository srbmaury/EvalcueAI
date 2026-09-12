import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve("src/pages/AssessmentBuilderPage.jsx"), "utf8");

describe("hiring assessment builder wiring", () => {
    it("uses explicit assessment-timezone payload helpers instead of UTC slicing", () => {
        expect(source).toContain("buildEditableAssessmentPayload");
        expect(source).toContain("formatLocalDateTimeInput");
        expect(source).not.toContain("toISOString().slice(0, 16)");
    });

    it("shows the debugging format only through the server capability and uses its dedicated editor", () => {
        expect(source).toContain('api.get("/assessments/capabilities")');
        expect(source).toContain("debuggingAssessmentsEnabled");
        expect(source).toContain('<MenuItem value="debugging">Debugging assignment</MenuItem>');
        expect(source).toContain("<DebuggingRoundEditor");
        expect(source).toContain("createDebuggingRound");
    });
});