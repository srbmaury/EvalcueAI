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
});
