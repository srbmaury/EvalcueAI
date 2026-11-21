import { expect, it, vi } from "vitest";
import Assessment from "../../models/Assessment.js";
import CandidateAttempt from "../../models/CandidateAttempt.js";
import evaluateCandidateAssessment from "../../queues/workers/candidateAssessment.js";

vi.mock("../../models/Assessment.js", () => ({
    default: { findById: vi.fn(), updateOne: vi.fn() },
}));
vi.mock("../../models/CandidateAttempt.js", () => ({
    default: { findOne: vi.fn(), updateOne: vi.fn() },
}));

it("guards the invitation completion write against concurrent revocation", async () => {
    CandidateAttempt.findOne.mockResolvedValue({
        _id: "attempt",
        assessment: "assessment",
        candidateEmail: "candidate@example.test",
        startedAt: new Date(),
        evaluationStartedAt: new Date(),
        rounds: [],
    });
    CandidateAttempt.updateOne.mockResolvedValue({ modifiedCount: 1 });
    Assessment.findById.mockReturnValue({ lean: async () => ({}) });
    Assessment.updateOne.mockResolvedValue({ modifiedCount: 0 });

    await expect(evaluateCandidateAssessment({ data: { attemptId: "attempt" } })).resolves.toMatchObject({ submitted: true });

    expect(Assessment.updateOne).toHaveBeenCalledWith(
        { _id: "assessment", invitations: { $elemMatch: { email: "candidate@example.test", status: { $nin: ["revoked", "bounced"] } } } },
        { $set: { "invitations.$.status": "completed" } },
    );
});
