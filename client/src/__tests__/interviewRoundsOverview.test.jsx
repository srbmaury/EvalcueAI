import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import InterviewRoundsOverview from "../components/InterviewRoundsOverview";

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe("InterviewRoundsOverview", () => {
    it("keeps round navigation on its own screen and enters only unlocked rounds", () => {
        const onSelect = vi.fn();
        const interview = {
            rounds: [
                {
                    round: {
                        _id: "round-1",
                        name: "DSA",
                        status: "completed",
                        questions: [{ answerGiven: "done" }],
                    },
                },
                {
                    round: {
                        _id: "round-2",
                        name: "System Design",
                        status: "pending",
                        questions: [{ answerGiven: "" }],
                    },
                },
                {
                    round: {
                        _id: "round-3",
                        name: "Behavioral",
                        status: "pending",
                        questions: [],
                    },
                },
            ],
            grounding: { status: "fallback", sources: [] },
        };

        render(
            <InterviewRoundsOverview
                interview={interview}
                selectedRoundId="round-2"
                onSelect={onSelect}
            />,
        );

        expect(screen.getByRole("heading", { name: "Choose your next round" })).toBeTruthy();
        expect(screen.getByText(/1 of 3 completed/)).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: /System Design/ }));
        expect(onSelect).toHaveBeenCalledWith(interview.rounds[1].round);

        expect(screen.getByRole("button", { name: /Behavioral/ }).disabled).toBe(true);
    });
});
