import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AiQualitySection from "../components/AiQualitySection";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../api/axios", () => ({ default: { get } }));

afterEach(() => cleanup());

const summary = (rates) => ({
    days: 30,
    since: "2026-08-28",
    rates: { followUpGuardInterventions: 4, followUpSuppressed: 1, followUpProviderUnavailable: 0, nextQuestionFallback: 2, adaptiveUnscored: 0.5, feedbackFailed: null, ...rates },
    volume: { followUpDecisions: 200, nextQuestions: 50, adaptiveEvaluations: 400, feedbackEvaluations: 0 },
    totals: [{ stage: "followup", signal: "repeat", outcome: "suppressed", count: 2 }],
    daily: [],
});

describe("AiQualitySection", () => {
    it("shows each rate with its denominator and no warning when within thresholds", async () => {
        get.mockResolvedValueOnce({ data: summary() });
        render(<AiQualitySection />);
        expect(await screen.findByText("AI quality, last 30 days")).toBeTruthy();
        expect(screen.getByText("4.0%")).toBeTruthy();
        expect(screen.getByText(/Drafts that invented facts or repeated a probe · of 200/)).toBeTruthy();
        expect(screen.getByText("—")).toBeTruthy();
        expect(screen.queryByText(/Above threshold/)).toBeNull();
        expect(get).toHaveBeenCalledWith("/admin/ai-quality", { params: { days: 30 } });
    });

    it("warns about rates above their thresholds", async () => {
        get.mockResolvedValueOnce({ data: summary({ adaptiveUnscored: 6.2, followUpGuardInterventions: 22 }) });
        render(<AiQualitySection />);
        const alert = await screen.findByText(/Above threshold/);
        expect(alert.parentElement.textContent).toMatch(/Follow-up guard interventions, Unscored answers/);
    });
});
