import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const updateMany = vi.fn(); const find = vi.fn(); const sendMail = vi.fn();
vi.mock("../../models/Assessment.js", () => ({ default: { updateMany, find } }));
vi.mock("../../utils/mailer.js", () => ({ sendMail }));
const { processAssessmentLifecycle } = await import("../../services/assessmentLifecycle.js");

const originalClientOrigin = process.env.CLIENT_ORIGIN;

const mockFind = (items) => {
    const query = { populate: vi.fn().mockResolvedValue(items) };
    find.mockReturnValue(query);
    return query;
};

describe("assessment lifecycle processing", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        updateMany.mockResolvedValue({ modifiedCount: 1 });
        mockFind([]);
        process.env.CLIENT_ORIGIN = "https://app.evalcue.example/";
    });

    afterAll(() => {
        if (originalClientOrigin === undefined) delete process.env.CLIENT_ORIGIN;
        else process.env.CLIENT_ORIGIN = originalClientOrigin;
    });

    it("opens scheduled assessments and closes expired ones", async () => {
        const result = await processAssessmentLifecycle(new Date("2026-08-12T12:00:00Z"));
        expect(updateMany).toHaveBeenCalledTimes(2);
        expect(result).toMatchObject({ opened: 1, closed: 1 });
    });

    it("delivers queued invitations using the shared structured email and assessment timezone", async () => {
        const invitation = { _id: "invite-1", email: "candidate@example.com", name: "Candidate", status: "queued", attempts: 0 };
        const assessment = {
            title: "Backend",
            jobRole: "Engineer",
            shareToken: "token",
            timezone: "Asia/Kolkata",
            durationMinutes: 45,
            expiresAt: new Date("2026-09-15T12:30:00.000Z"),
            contactEmail: "recruiting@example.com",
            inviteOnly: true,
            integrity: { enabled: true, requireCamera: true, requireFullscreen: true },
            organization: { name: "Acme Labs" },
            invitations: [invitation],
            save: vi.fn(),
        };
        mockFind([assessment]);
        sendMail.mockResolvedValue({ messageId: "provider-1" });

        const result = await processAssessmentLifecycle(new Date("2026-08-12T12:00:00Z"));

        expect(result.sent).toBe(1);
        expect(invitation).toMatchObject({ status: "sent", attempts: 1, providerMessageId: "provider-1" });
        expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
            to: "candidate@example.com",
            replyTo: "recruiting@example.com",
            text: expect.stringContaining("https://app.evalcue.example/assessment/token?invite=invite-1"),
            html: expect.stringContaining("Start assessment"),
        }));
        const mail = sendMail.mock.calls[0][0];
        expect(mail.text).toContain("Acme Labs");
        expect(mail.text).toContain("45 minutes");
        expect(mail.text).toContain("6:00 PM");
        expect(mail.text).toContain("Asia/Kolkata");
        expect(mail.text).toContain("Camera required");
        expect(mail.text).toContain("Fullscreen required");
        expect(mail.text).not.toContain("localhost");
        expect(assessment.save).toHaveBeenCalledOnce();
    });
});
