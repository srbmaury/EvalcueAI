import { describe, expect, it } from "vitest";
import { summarizeAiQuality } from "../../services/aiQuality.js";

const row = (stage, signal, outcome, count) => ({ stage, signal, outcome, count });

describe("AI quality summary", () => {
    it("turns guard events and outcomes into rates over their denominators", () => {
        const { rates, volume } = summarizeAiQuality([
            row("followup", "decision", "asked", 70),
            row("followup", "decision", "skipped", 25),
            row("followup", "decision", "provider_unavailable", 5),
            row("followup", "invented_specifics", "retried", 8),
            row("followup", "invented_specifics", "recovered", 6),
            row("followup", "invented_specifics", "suppressed", 2),
            row("followup", "repeat", "suppressed", 4),
            row("next_question", "source", "ai", 45),
            row("next_question", "source", "fallback", 4),
            row("next_question", "source", "deterministic", 1),
            row("adaptive_evaluation", "result", "scored", 198),
            row("adaptive_evaluation", "result", "unscored", 2),
            row("feedback_evaluation", "result", "ok", 99),
            row("feedback_evaluation", "result", "failed", 1),
        ]);
        expect(volume).toEqual({ followUpDecisions: 100, nextQuestions: 50, adaptiveEvaluations: 200, feedbackEvaluations: 100 });
        expect(rates).toEqual({
            followUpGuardInterventions: 12, // 8 retried (invented specifics) + 4 repeats suppressed, per 100 decisions
            followUpSuppressed: 6,
            followUpProviderUnavailable: 5,
            nextQuestionFallback: 10,
            adaptiveUnscored: 1,
            feedbackFailed: 1,
        });
    });

    it("reports null rates until there is a denominator", () => {
        expect(summarizeAiQuality([]).rates.adaptiveUnscored).toBeNull();
    });
});
