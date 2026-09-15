import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    findOne: vi.fn(),
    candidateAttemptUpdateOne: vi.fn(),
}));

vi.mock("../../models/Assessment.js", () => ({ default: { findOne: mocks.findOne } }));
vi.mock("../../models/CandidateAttempt.js", () => ({ default: { updateOne: mocks.candidateAttemptUpdateOne } }));
vi.mock("../../models/Organization.js", () => ({ default: {} }));
vi.mock("../../services/organizationUsage.js", () => ({ reserveCandidateInterview: vi.fn(), releaseOrganizationUsage: vi.fn() }));
vi.mock("../../utils/generateQuestions.js", () => ({ generateQuestionsForRound: vi.fn(), improveAssessmentQuestion: vi.fn() }));
vi.mock("../../utils/generateQuestions/followUp.js", () => ({ generateFollowUp: vi.fn() }));
vi.mock("../../metrics/index.js", () => ({ default: new Proxy({}, { get: () => ({ labels: () => ({ inc: vi.fn() }) }) }) }));
vi.mock("../../utils/runCode.js", () => ({ default: vi.fn() }));
vi.mock("./sttController.js", () => ({ transcribe: vi.fn() }));

import { revokeInvitation } from "../../controllers/assessmentController.js";

const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() });

describe("revokeInvitation", () => {
    beforeEach(() => { vi.clearAllMocks(); mocks.candidateAttemptUpdateOne.mockResolvedValue({ modifiedCount: 1 }); });

    it("marks the invitation revoked and cuts off any in-progress attempt tied to it (every candidate gate rejects non-'started' attempts)", async () => {
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
        expect(mocks.candidateAttemptUpdateOne).toHaveBeenCalledWith(
            { assessment: "assessment-1", invitation: "inv-1", status: "started" },
            { $set: { status: "revoked" } },
        );
        expect(res.json).toHaveBeenCalledWith({ invitation });
    });

    it("404s when the invitation doesn't exist and never touches CandidateAttempt", async () => {
        const assessment = { _id: "assessment-1", invitations: { id: vi.fn(() => null) }, save: vi.fn() };
        mocks.findOne.mockResolvedValue(assessment);
        const res = response();
        await revokeInvitation({ params: { assessmentId: "assessment-1", invitationId: "missing" }, organizationId: "org-1" }, res, vi.fn());
        expect(res.status).toHaveBeenCalledWith(404);
        expect(mocks.candidateAttemptUpdateOne).not.toHaveBeenCalled();
    });
});
