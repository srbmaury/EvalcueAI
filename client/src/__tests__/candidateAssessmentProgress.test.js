import { describe, expect, it } from "vitest";
import {
    completedQuestionCount,
    firstIncompleteQuestionIndex,
    pendingFollowUpFor,
    roundComplete,
} from "../utils/candidateAssessmentProgress";

describe("candidate assessment progress", () => {
    it("keeps an OA round open when an earlier problem is unanswered", () => {
        const round = {
            deliveryMode: "online-assessment",
            questions: [
                { answer: "" },
                { answer: "saved second answer" },
                { answer: "saved final answer" },
            ],
        };

        expect(firstIncompleteQuestionIndex(round)).toBe(0);
        expect(completedQuestionCount(round)).toBe(2);
        expect(roundComplete(round)).toBe(false);
    });

    it("treats a pending interviewer follow-up as incomplete", () => {
        const question = {
            answer: "primary answer",
            followUpQuestion: "What failure mode remains?",
            followUpAnswer: "",
        };
        const round = { deliveryMode: "online-assessment", questions: [question] };

        expect(pendingFollowUpFor(round, question)?.question).toBe("What failure mode remains?");
        expect(firstIncompleteQuestionIndex(round)).toBe(0);
        expect(roundComplete(round)).toBe(false);
    });

    it("finishes only after every OA problem is saved", () => {
        const round = {
            deliveryMode: "online-assessment",
            questions: [{ answer: "one" }, { answer: "two" }, { answer: "three" }],
        };

        expect(firstIncompleteQuestionIndex(round)).toBe(-1);
        expect(completedQuestionCount(round)).toBe(3);
        expect(roundComplete(round)).toBe(true);
    });

    it("requires a system-design explanation before the round is complete", () => {
        expect(roundComplete({ deliveryMode: "system-design", questions: [{ answer: "" }] })).toBe(false);
        expect(roundComplete({ deliveryMode: "system-design", questions: [{ answer: "Architecture explanation" }] })).toBe(true);
    });
});
