import { describe, expect, it } from "vitest";
import { buildEditableAssessmentPayload, formatLocalDateTimeInput } from "../utils/hiringAssessmentPayload";

describe("hiring assessment payload helpers", () => {
    it("strips server-managed fields and draft status from edit payloads", () => {
        const payload = buildEditableAssessmentPayload({
            _id: "assessment-1",
            status: "draft",
            organization: "org-1",
            createdBy: "user-1",
            shareToken: "secret-token",
            title: "Backend",
            jobRole: "Engineer",
            jobDescription: "Build reliable systems and explain engineering trade-offs.",
            opensAt: "2026-09-14T09:00",
            expiresAt: "2026-09-15T18:00",
            timezone: "Asia/Kolkata",
            rounds: [],
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

    it("formats stored instants for datetime-local without using UTC clock fields", () => {
        const original = process.env.TZ;
        process.env.TZ = "Asia/Kolkata";
        try {
            expect(formatLocalDateTimeInput("2026-09-15T12:30:00.000Z")).toBe("2026-09-15T18:00");
        } finally {
            process.env.TZ = original;
        }
    });
});
