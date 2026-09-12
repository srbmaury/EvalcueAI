import { describe, expect, it } from "vitest";
import { buildInterviewFeedbackSummary } from "../utils/interviewFeedbackSummary";

const feedback = (score, suggestion) => ({ score, suggestions: suggestion ? [suggestion] : [] });

const interview = {
    overallScore: 7.3,
    rounds: [
        { round: { _id: "r1", name: "DSA", status: "completed", questions: [
            { feedback: feedback(8, "State complexity") },
            { feedback: feedback(9, "State complexity") },
        ] } },
        { round: { _id: "r2", name: "System Design", status: "completed", questions: [
            { feedback: feedback(5, "Explain trade-offs") },
        ] } },
    ],
};

describe("buildInterviewFeedbackSummary", () => {
    it("summarizes interview-level strengths and priorities across rounds", () => {
        const summary = buildInterviewFeedbackSummary(interview);
        expect(summary.overallScore).toBe(7.3);
        expect(summary.scoredQuestionCount).toBe(3);
        expect(summary.strongestRound.name).toBe("DSA");
        expect(summary.strongestRound.score).toBe(8.5);
        expect(summary.focusRound.name).toBe("System Design");
        expect(summary.focusRound.score).toBe(5);
        expect(summary.topSuggestions).toEqual(["Explain trade-offs", "State complexity"]);
    });
});
