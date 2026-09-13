import { describe, expect, it } from "vitest";
import { buildEditableAssessmentPayload, formatLocalDateTimeInput, localDateTimeToIso } from "../utils/hiringAssessmentPayload";

describe("hiring assessment payload helpers", () => {
    it("strips server-managed fields and draft status from edit payloads", () => {
        const payload = buildEditableAssessmentPayload({
            _id: "assessment-1", status: "draft", organization: "org-1", createdBy: "user-1", shareToken: "server-token",
            title: "Backend", jobRole: "Engineer", jobDescription: "Build reliable systems and explain engineering trade-offs.",
            opensAt: "2026-09-14T09:00", expiresAt: "2026-09-15T18:00", timezone: "Asia/Kolkata", rounds: [],
        });
        expect(payload.status).toBeUndefined();
        expect(payload._id).toBeUndefined();
        expect(payload.organization).toBeUndefined();
        expect(payload.createdBy).toBeUndefined();
        expect(payload.shareToken).toBeUndefined();
        expect(payload.title).toBe("Backend");
        expect(payload.opensAt).toBe("2026-09-14T03:30:00.000Z");
        expect(payload.expiresAt).toBe("2026-09-15T12:30:00.000Z");
    });

    it("preserves multi-file debugging configuration and hidden test display names", () => {
        const payload = buildEditableAssessmentPayload({
            title: "Debugging", jobRole: "Engineer", jobDescription: "Debug a production service and explain engineering trade-offs.", timezone: "UTC",
            rounds: [{
                name: "Debugging", description: "Fix the defect", deliveryMode: "debugging", adaptive: false, questionCount: 1,
                questions: [{ text: "Fix duplicate processing", required: true }],
                debugging: {
                    responseMode: "code_fix", runtime: "node-22", entryFile: "src/index.js",
                    files: [
                        { path: "src/index.js", content: "buggy", kind: "source" },
                        { path: "tests/duplicate.test.js", content: "test", kind: "hidden_test", displayName: "prevents duplicate charge" },
                    ],
                },
            }],
        });
        expect(payload.rounds[0].debugging).toEqual(expect.objectContaining({
            responseMode: "code_fix", runtime: "node-22", entryFile: "src/index.js",
            files: expect.arrayContaining([expect.objectContaining({ path: "tests/duplicate.test.js", kind: "hidden_test", displayName: "prevents duplicate charge" })]),
        }));
    });

    it("formats stored instants using the assessment timezone", () => {
        expect(formatLocalDateTimeInput("2026-09-15T12:30:00.000Z", "Asia/Kolkata")).toBe("2026-09-15T18:00");
        expect(formatLocalDateTimeInput("2026-09-15T12:30:00.000Z", "America/New_York")).toBe("2026-09-15T08:30");
    });

    it("converts assessment-local wall clock values to UTC", () => {
        expect(localDateTimeToIso("2026-09-15T18:00", "Asia/Kolkata")).toBe("2026-09-15T12:30:00.000Z");
        expect(localDateTimeToIso("2026-09-15T08:30", "America/New_York")).toBe("2026-09-15T12:30:00.000Z");
    });
});
