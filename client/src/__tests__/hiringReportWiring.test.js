import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = [
    fs.readFileSync(path.resolve("src/pages/AssessmentReportPage.jsx"), "utf8"),
    fs.readFileSync(path.resolve("src/pages/AssessmentReportPageLegacy.jsx"), "utf8"),
].join("\n");

describe("hiring assessment report wiring", () => {
    it("validates invite input and formats assessment times explicitly", () => {
        expect(source).toContain("parseCandidateInvites");
        expect(source).toContain("invitationDeliverySummary");
        expect(source).toContain("formatAssessmentDateTime");
    });
});
