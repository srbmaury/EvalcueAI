import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    updateMany: vi.fn(),
    findAssessments: vi.fn(),
    sendMail: vi.fn(),
    leaseFindOneAndUpdate: vi.fn(),
    leaseDeleteOne: vi.fn(),
    candidateFind: vi.fn(),
    candidateDeleteOne: vi.fn(),
    expiredCandidateReservations: vi.fn(),
    releaseOrganizationUsage: vi.fn(),
}));

vi.mock("../../models/Assessment.js", () => ({ default: { updateMany: mocks.updateMany, find: mocks.findAssessments } }));
vi.mock("../../models/SchedulerLease.js", () => ({ default: { findOneAndUpdate: mocks.leaseFindOneAndUpdate, deleteOne: mocks.leaseDeleteOne } }));
vi.mock("../../models/CandidateAttempt.js", () => ({ default: { find: mocks.candidateFind, deleteOne: mocks.candidateDeleteOne } }));
vi.mock("../../services/organizationUsage.js", () => ({
    expiredCandidateReservations: mocks.expiredCandidateReservations,
    releaseOrganizationUsage: mocks.releaseOrganizationUsage,
}));
vi.mock("../../utils/mailer.js", () => ({ sendMail: mocks.sendMail }));
vi.mock("../../config/clientOrigins.js", () => ({ practiceClientOrigin: () => "https://app.evalcue.example" }));

const { processAssessmentLifecycle } = await import("../../services/assessmentLifecycle.js");

// Assessment.find(...) is called twice per run: once with .populate("organization",
// "name") for the invitation-send pass, once bare for the reconciliation pass. Returning
// a Promise with a .populate() method attached lets the same mock serve both call shapes.
const mockFind = (items) => {
    const query = Promise.resolve(items);
    query.populate = vi.fn().mockResolvedValue(items);
    mocks.findAssessments.mockReturnValue(query);
    return query;
};

describe("assessment lifecycle processing", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.updateMany.mockResolvedValue({ modifiedCount: 1 });
        mockFind([]);
        mocks.leaseFindOneAndUpdate.mockImplementation(async (_filter, update) => ({ owner: update.$set.owner }));
        mocks.leaseDeleteOne.mockResolvedValue({ deletedCount: 1 });
        mocks.expiredCandidateReservations.mockResolvedValue([]);
        mocks.releaseOrganizationUsage.mockResolvedValue(true);
        mocks.candidateFind.mockReturnValue({ select: () => ({ lean: vi.fn().mockResolvedValue([]) }) });
        mocks.candidateDeleteOne.mockResolvedValue({ deletedCount: 0 });
        mocks.sendMail.mockResolvedValue({ messageId: "provider-1" });
    });

    it("opens scheduled assessments and closes expired ones", async () => {
        const result = await processAssessmentLifecycle(new Date("2026-08-12T12:00:00Z"));
        expect(mocks.updateMany).toHaveBeenCalledTimes(2);
        expect(result).toMatchObject({ opened: 1, closed: 1, released: 0, reconciled: 0 });
        expect(mocks.leaseDeleteOne).toHaveBeenCalledOnce();
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

        const result = await processAssessmentLifecycle(new Date("2026-08-12T12:00:00Z"));

        expect(result.sent).toBe(1);
        expect(invitation).toMatchObject({ status: "sent", attempts: 1, providerMessageId: "provider-1" });
        expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({
            to: "candidate@example.com",
            replyTo: "recruiting@example.com",
            text: expect.stringContaining("https://app.evalcue.example/assessment/token?invite=invite-1"),
            html: expect.stringContaining("Start assessment"),
        }));
        const mail = mocks.sendMail.mock.calls[0][0];
        expect(mail.text).toContain("Acme Labs");
        expect(mail.text).toContain("45 minutes");
        expect(mail.text).toContain("6:00 PM");
        expect(mail.text).toContain("Asia/Kolkata");
        expect(mail.text).toContain("Camera required");
        expect(mail.text).toContain("Fullscreen required");
        expect(mail.text).not.toContain("localhost");
        expect(assessment.save).toHaveBeenCalledOnce();
    });

    it("saves each invitation's send outcome immediately, not once at the end of the whole assessment's batch", async () => {
        // A crash or an overlapping tick partway through a multi-invitation batch must
        // not leave an already-sent invitation looking "queued", which would resend it.
        const invitations = [
            { _id: "invite-1", email: "a@example.com", name: "A", status: "queued", attempts: 0 },
            { _id: "invite-2", email: "b@example.com", name: "B", status: "queued", attempts: 0 },
            { _id: "invite-3", email: "c@example.com", name: "C", status: "queued", attempts: 0 },
        ];
        const assessment = {
            title: "Backend", jobRole: "Engineer", shareToken: "token", timezone: "UTC",
            durationMinutes: 45, expiresAt: null, integrity: { enabled: false },
            organization: { name: "Acme Labs" }, invitations, save: vi.fn(),
        };
        mockFind([assessment]);

        const result = await processAssessmentLifecycle(new Date("2026-08-12T12:00:00Z"));

        expect(result.sent).toBe(3);
        expect(assessment.save).toHaveBeenCalledTimes(3);
        expect(invitations.every((invitation) => invitation.status === "sent")).toBe(true);
    });
});
