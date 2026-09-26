import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    findOne: vi.fn(),
    candidateAttemptUpdateMany: vi.fn(),
    candidateAttemptFind: vi.fn(),
    releaseAttemptReservation: vi.fn(),
}));

vi.mock("../../models/Assessment.js", () => ({ default: { findOne: mocks.findOne } }));
vi.mock("../../models/CandidateAttempt.js", () => ({ default: {
    updateMany: mocks.candidateAttemptUpdateMany,
    find: (...args) => { mocks.candidateAttemptFind(...args); return { select: () => ({ lean: async () => mocks.inProgress || [] }) }; },
} }));
vi.mock("../../models/Organization.js", () => ({ default: {} }));
vi.mock("../../services/organizationUsage.js", () => ({ reserveCandidateInterview: vi.fn(), releaseOrganizationUsage: vi.fn(), releaseAttemptReservation: mocks.releaseAttemptReservation }));
vi.mock("../../utils/generateQuestions.js", () => ({ generateQuestionsForRound: vi.fn(), improveAssessmentQuestion: vi.fn() }));
vi.mock("../../utils/generateQuestions/followUp.js", () => ({ generateFollowUp: vi.fn() }));
vi.mock("../../metrics/index.js", () => ({ default: new Proxy({}, { get: () => ({ labels: () => ({ inc: vi.fn() }) }) }) }));
vi.mock("../../utils/runCode.js", () => ({ default: vi.fn() }));
vi.mock("./sttController.js", () => ({ transcribe: vi.fn() }));

import { revokeInvitation } from "../../controllers/assessmentController.js";

const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() });

describe("revokeInvitation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.inProgress = [{ _id: "attempt-1" }];
        mocks.candidateAttemptUpdateMany.mockResolvedValue({ modifiedCount: 1 });
        mocks.releaseAttemptReservation.mockResolvedValue(true);
    });

    it("revokes the invitation, cuts off its in-progress attempt, and returns the attempt's interview slot", async () => {
        const invitation = { _id: "inv-1", status: "sent", revokedAt: null };
        const assessment = {
            _id: "assessment-1",
            invitations: { id: vi.fn(() => invitation) },
            save: vi.fn().mockResolvedValue(true),
        };
        mocks.findOne.mockResolvedValue(assessment);

        const req = { params: { assessmentId: "assessment-1", invitationId: "inv-1" }, organizationId: "org-1" };
        const res = response();
        await revokeInvitation(req, res, vi.fn());

        expect(invitation.status).toBe("revoked");
        expect(invitation.revokedAt).toBeInstanceOf(Date);
        expect(assessment.save).toHaveBeenCalledOnce();
        expect(mocks.candidateAttemptFind).toHaveBeenCalledWith({ assessment: "assessment-1", invitation: "inv-1", status: "started" });
        expect(mocks.candidateAttemptUpdateMany).toHaveBeenCalledWith(
            { _id: { $in: ["attempt-1"] }, status: "started" },
            { $set: { status: "revoked" } },
        );
        expect(mocks.releaseAttemptReservation).toHaveBeenCalledWith("attempt-1");
        expect(res.json).toHaveBeenCalledWith({ invitation });
    });

    it("404s when the invitation doesn't exist and never touches CandidateAttempt", async () => {
        const assessment = { _id: "assessment-1", invitations: { id: vi.fn(() => null) }, save: vi.fn() };
        mocks.findOne.mockResolvedValue(assessment);
        const res = response();
        await revokeInvitation({ params: { assessmentId: "assessment-1", invitationId: "missing" }, organizationId: "org-1" }, res, vi.fn());
        expect(res.status).toHaveBeenCalledWith(404);
        expect(mocks.candidateAttemptUpdateMany).not.toHaveBeenCalled();
        expect(mocks.releaseAttemptReservation).not.toHaveBeenCalled();
    });
});
