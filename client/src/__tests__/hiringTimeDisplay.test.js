import { describe, expect, it } from "vitest";
import { formatAssessmentDateTime } from "../utils/hiringAssessmentPayload";

describe("hiring assessment date display", () => {
    it("formats recruiter-facing dates in the assessment timezone", () => {
        expect(formatAssessmentDateTime("2026-09-15T12:30:00.000Z", "Asia/Kolkata")).toContain("6:00 PM");
        expect(formatAssessmentDateTime("2026-09-15T12:30:00.000Z", "Asia/Kolkata")).toContain("Asia/Kolkata");
    });
});
