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

describe("assessment lifecycle processing", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.updateMany.mockResolvedValue({ modifiedCount: 1 });
        mocks.findAssessments.mockResolvedValue([]);
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

    it("delivers queued invitations using the documented client origin", async () => {
        const invitation = { _id: "invite-1", email: "candidate@example.com", name: "Candidate", status: "queued", attempts: 0 };
        const assessment = { _id: "assessment-1", title: "Backend", jobRole: "Engineer", shareToken: "token", timezone: "UTC", invitations: [invitation], save: vi.fn().mockResolvedValue(undefined) };
        mocks.findAssessments.mockResolvedValue([assessment]);
        const result = await processAssessmentLifecycle(new Date("2026-08-12T12:00:00Z"));
        expect(result.sent).toBe(1);
        expect(invitation).toMatchObject({ status: "sent", attempts: 1, providerMessageId: "provider-1" });
        expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({
            text: expect.stringContaining("https://app.evalcue.example/assessment/token?invite=invite-1"),
            html: expect.stringContaining("https://app.evalcue.example/assessment/token?invite=invite-1"),
        }));
        expect(mocks.sendMail.mock.calls[0][0].text).not.toContain("localhost");
        expect(assessment.save).toHaveBeenCalledOnce();
    });
});
