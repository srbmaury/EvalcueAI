import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../utils/generateQuestions/aiClient.js", () => ({ generateJSON: vi.fn() }));

import { generateJSON } from "../../utils/generateQuestions/aiClient.js";
import { applyEvidenceToState, evaluateAdaptiveAnswer } from "../../services/adaptiveInterviewEngine.js";

const state = () => ({
    enabled: true,
    minQuestions: 2,
    maxQuestions: 5,
    currentDifficulty: 3,
    questionsAsked: 0,
    competencies: [
        { name: "APIs", weight: 1, scoreEstimate: null, confidence: 0, evidenceCount: 0, coverage: "uncovered", evidence: [] },
        { name: "Reliability", weight: 1, scoreEstimate: null, confidence: 0, evidenceCount: 0, coverage: "uncovered", evidence: [] },
    ],
    resumeClaims: [],
});

const evaluate = () => evaluateAdaptiveAnswer({
    questionText: "Design an idempotent payments API.",
    answerText: "I would use idempotency keys stored with the request hash.",
    targetedCompetencies: ["APIs"],
    state: state(),
    jobRole: "Backend Engineer",
    roundName: "Technical",
});

describe("adaptive evaluation failures", () => {
    beforeEach(() => vi.clearAllMocks());

    it("retries once and uses the second valid evaluation", async () => {
        generateJSON.mockResolvedValueOnce("{broken").mockResolvedValueOnce(JSON.stringify({ overallScore: 7, confidence: 0.6 }));
        const result = await evaluate();
        expect(result.unscored).toBeUndefined();
        expect(result.overallScore).toBe(7);
        expect(generateJSON).toHaveBeenCalledTimes(2);
    });

    it("marks the answer unscored instead of inventing a middling score", async () => {
        generateJSON.mockResolvedValue("{broken");
        const result = await evaluate();
        expect(result).toMatchObject({ unscored: true, overallScore: null, confidence: 0, competencyEvidence: [] });
        expect(result.policy.action).toBe("next-question");
    });

    it("adds no competency evidence or coverage for an unscored answer", async () => {
        generateJSON.mockRejectedValue(new Error("provider down"));
        const result = await evaluate();
        const next = applyEvidenceToState(state(), result, { questionIndex: 0, targetedCompetencies: ["APIs"] });
        expect(next.questionsAsked).toBe(1);
        expect(next.competencies.every((item) => item.evidenceCount === 0 && item.coverage === "uncovered" && item.scoreEstimate === null)).toBe(true);
    });
});
