import { describe, expect, it } from "vitest";
import { buildHiringInvitationEmail } from "../../utils/hiringInvitationEmail.js";

describe("buildHiringInvitationEmail", () => {
    it("includes the candidate, organization, role, duration, access requirements, support contact, timezone and CTA", () => {
        const mail = buildHiringInvitationEmail({
            candidateName: "Asha",
            candidateEmail: "asha@example.com",
            organizationName: "Acme Labs",
            assessmentTitle: "Backend Engineer Assessment",
            jobRole: "Backend Engineer",
            durationMinutes: 45,
            opensAt: new Date("2026-09-14T03:30:00.000Z"),
            expiresAt: new Date("2026-09-15T12:30:00.000Z"),
            timezone: "Asia/Kolkata",
            candidateLink: "https://practice.evalcueai.com/assessment/token?invite=invite-1",
            contactEmail: "recruiting@acme.example",
            inviteOnly: true,
            integrity: { enabled: true, requireCamera: true, requireFullscreen: true },
        });

        expect(mail.to).toBe("asha@example.com");
        expect(mail.replyTo).toBe("recruiting@acme.example");
        expect(mail.subject).toContain("Acme Labs");
        expect(mail.text).toContain("Hi Asha");
        expect(mail.text).toContain("Backend Engineer Assessment");
        expect(mail.text).toContain("Backend Engineer");
        expect(mail.text).toContain("45 minutes");
        expect(mail.text).toContain("Asia/Kolkata");
        expect(mail.text).toContain("Camera required");
        expect(mail.text).toContain("Fullscreen required");
        expect(mail.text).toContain("Invitation-only");
        expect(mail.text).toContain("recruiting@acme.example");
        expect(mail.text).toContain("https://practice.evalcueai.com/assessment/token?invite=invite-1");
        expect(mail.html).toContain("Start assessment");
        expect(mail.html).toContain("Acme Labs");
    });

    it("formats deadlines in the assessment timezone rather than the server timezone", () => {
        const mail = buildHiringInvitationEmail({
            candidateName: "there",
            candidateEmail: "candidate@example.com",
            organizationName: "Evalcue Customer",
            assessmentTitle: "Assessment",
            jobRole: "Engineer",
            durationMinutes: 30,
            expiresAt: new Date("2026-09-15T12:30:00.000Z"),
            timezone: "Asia/Kolkata",
            candidateLink: "https://practice.evalcueai.com/assessment/token",
            integrity: { enabled: false },
        });

        expect(mail.text).toContain("6:00 PM");
        expect(mail.text).toContain("Asia/Kolkata");
    });
});
