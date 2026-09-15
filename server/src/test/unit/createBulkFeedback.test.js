import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    feedbackCreate: vi.fn(),
    feedbackFind: vi.fn(),
    interviewFind: vi.fn(),
    roundFind: vi.fn(),
    questionFind: vi.fn(),
    generateFeedbackForAnswer: vi.fn(),
}));

vi.mock("../../models/Feedback.js", () => ({ default: { create: mocks.feedbackCreate, find: mocks.feedbackFind } }));
vi.mock("../../models/Round.js", () => ({ default: { find: mocks.roundFind } }));
vi.mock("../../models/Question.js", () => ({ default: { find: mocks.questionFind } }));
vi.mock("../../models/Interview.js", () => ({ default: { find: mocks.interviewFind } }));
vi.mock("../../utils/generateFeedback.js", () => ({ generateFeedbackForAnswer: mocks.generateFeedbackForAnswer }));

import { createBulkFeedback } from "../../controllers/feedbackController.js";

const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() });

describe("createBulkFeedback", () => {
    beforeEach(() => vi.clearAllMocks());

    it("returns the successful items instead of discarding the whole batch when one item's AI evaluation fails", async () => {
        mocks.interviewFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([{ rounds: [{ round: "round-1" }] }]) }) });
        mocks.roundFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([{ questions: [{ question: "q1" }, { question: "q2" }] }]) }) });
        mocks.questionFind.mockResolvedValue([
            { _id: "q1", text: "Question 1" },
            { _id: "q2", text: "Question 2" },
        ]);
        mocks.generateFeedbackForAnswer
            .mockResolvedValueOnce({ comment: "Good", score: 8 })
            .mockRejectedValueOnce(new Error("AI providers returned no evaluation"));
        mocks.feedbackCreate.mockResolvedValueOnce({ _id: "fb-1", question: "q1" });

        const req = { user: { _id: "user-1" }, body: { items: [{ questionId: "q1", answer: "a1" }, { questionId: "q2", answer: "a2" }] } };
        const res = response();
        await createBulkFeedback(req, res, vi.fn());

        expect(res.status).toHaveBeenCalledWith(201);
        const payload = res.json.mock.calls[0][0];
        expect(payload.count).toBe(1);
        expect(payload.feedback).toHaveLength(1);
        expect(payload.feedback[0]._id).toBe("fb-1");
        expect(payload.failed).toEqual([{ questionId: "q2" }]);
        expect(mocks.feedbackCreate).toHaveBeenCalledTimes(1); // q1's DB write isn't undone by q2 failing
    });
});
