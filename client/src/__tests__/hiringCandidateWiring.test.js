import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve("src/pages/CandidateAssessmentPage.jsx"), "utf8");

describe("hiring candidate assessment wiring", () => {
    it("uses centralized integrity and transcription policies", () => {
        expect(source).toContain("canStartHiringAssessment");
        expect(source).toContain("integrityRecoveryReason");
        expect(source).toContain("candidateTranscriptionConfig");
    });
});
