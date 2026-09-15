import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    feedbackCreate: vi.fn(),
    roundFindById: vi.fn(),
    questionFind: vi.fn(),
    interviewFindOne: vi.fn(),
    generateFeedbackForAnswer: vi.fn(),
}));

vi.mock("../../models/Feedback.js", () => ({ default: { create: mocks.feedbackCreate } }));
vi.mock("../../models/Round.js", () => ({ default: { findById: mocks.roundFindById } }));
vi.mock("../../models/Question.js", () => ({ default: { find: mocks.questionFind } }));
vi.mock("../../models/Interview.js", () => ({ default: { findOne: mocks.interviewFindOne } }));
vi.mock("../../utils/generateFeedback.js", () => ({ generateFeedbackForAnswer: mocks.generateFeedbackForAnswer }));

import bulkFeedbackProcessor from "../../queues/workers/bulkFeedback.js";

const makeJob = (data) => ({ data, updateProgress: vi.fn() });

describe("bulkFeedbackProcessor idempotency on retry", () => {
    beforeEach(() => vi.clearAllMocks());

    it("skips regenerating feedback for an item a prior (failed) attempt already attached, and saves after each new attachment", async () => {
        mocks.interviewFindOne.mockReturnValue({ lean: () => Promise.resolve({ jobRole: "Backend", jobDescription: "Build APIs" }) });
        const round = {
            name: "Round",
            questions: [
                { question: "q1", feedback: "already-attached-feedback-id" }, // prior attempt succeeded here
                { question: "q2", feedback: undefined }, // prior attempt never reached this one
            ],
            save: vi.fn().mockResolvedValue(true),
        };
        mocks.roundFindById.mockResolvedValue(round);
        mocks.questionFind.mockResolvedValue([
            { _id: "q1", text: "Question 1" },
            { _id: "q2", text: "Question 2" },
        ]);
        mocks.generateFeedbackForAnswer.mockResolvedValue({ comment: "Good", score: 7 });
        mocks.feedbackCreate.mockResolvedValue({ _id: "new-feedback-id" });

        const job = makeJob({
            roundId: "round-1",
            userId: "user-1",
            items: [
                { questionId: "q1", index: 0, answer: "answer 1" },
                { questionId: "q2", index: 1, answer: "answer 2" },
            ],
        });
        const result = await bulkFeedbackProcessor(job);

        expect(mocks.generateFeedbackForAnswer).toHaveBeenCalledTimes(1); // only for q2
        expect(mocks.feedbackCreate).toHaveBeenCalledTimes(1);
        expect(round.questions[1].feedback).toBe("new-feedback-id");
        expect(round.save).toHaveBeenCalledTimes(1); // saved once, right after the new attachment
        expect(result).toEqual({ count: 1, attached: 2 }); // 1 newly created, 2 attached total
    });
});
