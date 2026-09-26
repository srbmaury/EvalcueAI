import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the AI client so tests don't make real network calls
vi.mock("../../utils/generateQuestions/aiClient.js", () => ({
    generateJSON: vi.fn(),
}));

import { generateJSON } from "../../utils/generateQuestions/aiClient.js";
import { generateFeedbackForAnswer } from "../../utils/generateFeedback.js";

describe("generateFeedbackForAnswer", () => {
    beforeEach(() => vi.clearAllMocks());

    it("returns structured feedback on a valid AI response", async () => {
        generateJSON.mockResolvedValue(JSON.stringify({
            comment: "Good answer",
            score: 8,
            suggestions: ["Be more concise", "Add an example"],
        }));

        const result = await generateFeedbackForAnswer({
            questionText: "What is a closure?",
            userAnswer: "A closure is a function that captures its outer scope.",
        });

        expect(result.comment).toBe("Good answer");
        expect(result.score).toBe(8);
        expect(result.suggestions).toHaveLength(2);
    });

    it("clamps score to 0–10 range", async () => {
        generateJSON.mockResolvedValue(JSON.stringify({ comment: "ok", score: 99, suggestions: [] }));
        const result = await generateFeedbackForAnswer({ questionText: "Q", userAnswer: "A" });
        expect(result.score).toBe(10);
    });

    it("fails evaluation when every AI provider returns empty", async () => {
        generateJSON.mockResolvedValue("");
        await expect(generateFeedbackForAnswer({ questionText: "Q", userAnswer: "A" }))
            .rejects.toThrow("AI providers returned no evaluation");
    });

    it("retries once when the response is not valid JSON", async () => {
        generateJSON.mockResolvedValueOnce("not json").mockResolvedValueOnce(JSON.stringify({ comment: "ok", score: 6 }));
        const result = await generateFeedbackForAnswer({ questionText: "Q", userAnswer: "A" });
        expect(result.score).toBe(6);
        expect(generateJSON).toHaveBeenCalledTimes(2);
    });

    it("fails instead of storing a zero when no response carries a score", async () => {
        generateJSON.mockResolvedValue(JSON.stringify({ comment: "Looks fine" }));
        await expect(generateFeedbackForAnswer({ questionText: "Q", userAnswer: "A" }))
            .rejects.toThrow("AI providers returned no evaluation");
        expect(generateJSON).toHaveBeenCalledTimes(2);
    });

    it("propagates provider failures so the evaluation job can retry", async () => {
        generateJSON.mockRejectedValue(new Error("timeout"));
        await expect(generateFeedbackForAnswer({ questionText: "Q", userAnswer: "A" }))
            .rejects.toThrow("timeout");
    });

    it("returns early error when questionText is empty", async () => {
        const result = await generateFeedbackForAnswer({ questionText: "", userAnswer: "A" });
        expect(result.comment).toBe("No question provided to evaluate.");
        expect(generateJSON).not.toHaveBeenCalled();
    });

    it("filters empty suggestions", async () => {
        generateJSON.mockResolvedValue(JSON.stringify({
            comment: "ok",
            score: 5,
            suggestions: ["  ", "valid suggestion", ""],
        }));
        const result = await generateFeedbackForAnswer({ questionText: "Q", userAnswer: "A" });
        expect(result.suggestions).toEqual(["valid suggestion"]);
    });

    it("uses a system-design rubric without judging drawing polish", async () => {
        generateJSON.mockResolvedValue(JSON.stringify({ comment: "Coherent design", score: 7, suggestions: [] }));
        await generateFeedbackForAnswer({
            questionText: "Design a notification service",
            userAnswer: "API Gateway -> Queue -> Worker",
            evaluationContext: { mode: "system-design", jobRole: "Staff Engineer", jobDescription: "Design reliable distributed systems", roundDescription: "Architecture trade-offs", rubric: [{ name: "Reliability", description: "Failure handling" }] },
        });
        expect(generateJSON).toHaveBeenCalledWith(expect.stringContaining("Do not reward visual polish or penalize drawing quality"));
        expect(generateJSON).toHaveBeenCalledWith(expect.stringContaining("Reliability: Failure handling"));
    });
});
