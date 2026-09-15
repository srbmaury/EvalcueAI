import { useCallback, useEffect, useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import CandidateAssessmentPage from "../pages/CandidateAssessmentPage";

const { get, post, put } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock("../api/axios", () => ({ default: { get, post, put } }));

const mocks = vi.hoisted(() => ({
    speakNowSpy: vi.fn(),
    resumeHandsFreeSpy: vi.fn(),
    startHandsFreeSpy: vi.fn(),
}));

// Mirrors the real useVoiceInput hook's shape, but its callbacks deliberately get a new
// identity on every "churn" tick — simulating an unrelated re-render (e.g. any other state
// update elsewhere in CandidateAssessmentPage) racing with an in-flight speakNow call. This
// is exactly the condition that broke OAForm's equivalent effect before it was fixed to keep
// the resume call in its own effect rather than at the end of the same async chain.
vi.mock("../hooks/useVoiceInput", () => ({
    useVoiceInput: () => {
        // Only starts churning once speaking has actually begun — churning from the very
        // first render would also cancel the initial start/pause/delay sequence before it
        // ever gets to speakNow, which isn't the race this test targets.
        const [churn, setChurn] = useState(0);
        const [speakingStarted, setSpeakingStarted] = useState(false);
        const [handsFreePaused, setHandsFreePaused] = useState(false);
        const [micSessionActive, setMicSessionActive] = useState(false);
        useEffect(() => {
            if (!speakingStarted) return undefined;
            const id = setInterval(() => setChurn((c) => c + 1), 15);
            return () => clearInterval(id);
        }, [speakingStarted]);
        const startHandsFree = useCallback(async (target) => { setMicSessionActive(true); mocks.startHandsFreeSpy(target); }, [churn]);
        const pauseHandsFree = useCallback(async () => { setHandsFreePaused(true); }, [churn]);
        const resumeHandsFree = useCallback(async (target) => { setHandsFreePaused(false); mocks.resumeHandsFreeSpy(target); }, [churn]);
        const speakNow = useCallback((text) => { setSpeakingStarted(true); return mocks.speakNowSpy(text); }, [churn]);
        return {
            listening: false, listeningTarget: null, interimText: "", micLevel: 0, micPermission: "granted",
            micSessionActive, handsFreePaused, inputDevices: [], selectedDeviceId: "default", setSelectedDeviceId: vi.fn(),
            supportsSTT: true, supportsTTS: true,
            startListening: vi.fn(), stopListening: vi.fn(), retargetListening: vi.fn(), speakNow,
            startHandsFree, pauseHandsFree, resumeHandsFree, stopHandsFree: vi.fn(),
        };
    },
}));

afterEach(() => { cleanup(); sessionStorage.clear(); localStorage.clear(); vi.clearAllMocks(); });

const renderCandidate = (entry = "/assessment/share-token-123456789") => {
    window.history.replaceState({}, "", entry);
    return render(
        <MemoryRouter initialEntries={[entry]}>
            <Routes><Route path="/assessment/:shareToken" element={<CandidateAssessmentPage />} /></Routes>
        </MemoryRouter>,
    );
};

describe("candidate coding round hands-free narration", () => {
    it("narrates the problem and resumes the mic afterward, even with unrelated re-renders churning the voice callbacks mid-utterance", async () => {
        let resolveSpeak;
        mocks.speakNowSpy.mockImplementation(() => new Promise((resolve) => { resolveSpeak = resolve; }));

        get.mockResolvedValue({ data: {
            title: "Coding screen", jobRole: "Engineer", durationMinutes: 30, followUpsEnabled: false,
            capabilities: { transcription: true, codeExecution: false },
            rounds: [{ name: "Coding", deliveryMode: "online-assessment", questionCount: 1 }],
        } });
        const question = { _id: "q1", text: "Implement a rate limiter.", answer: "" };
        const baseAttempt = { _id: "attempt", startedAt: new Date().toISOString(), rounds: [{ _id: "round", name: "Coding", deliveryMode: "online-assessment", questions: [question] }] };
        post.mockResolvedValue({ data: { attemptToken: "token", attempt: baseAttempt } });

        renderCandidate();
        fireEvent.change(await screen.findByLabelText(/Full name/), { target: { value: "Candidate" } });
        fireEvent.change(screen.getByLabelText(/Email address/), { target: { value: "candidate@example.com" } });
        fireEvent.click(screen.getAllByRole("checkbox")[0]);
        fireEvent.click(screen.getByRole("button", { name: "Start assessment" }));

        expect(await screen.findByRole("heading", { name: "Implement a rate limiter." })).toBeTruthy();

        await waitFor(() => expect(mocks.speakNowSpy).toHaveBeenCalled(), { timeout: 3000 });
        expect(mocks.speakNowSpy.mock.calls[0][0]).toContain("Implement a rate limiter.");

        // Let several churn re-renders land while the utterance is still "speaking".
        await new Promise((resolve) => setTimeout(resolve, 90));
        expect(mocks.resumeHandsFreeSpy).not.toHaveBeenCalled();

        resolveSpeak(true);

        await waitFor(() => expect(mocks.resumeHandsFreeSpy).toHaveBeenCalled());
    });
});
