import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SystemDesignDiscussionPanel from "../components/SystemDesignDiscussionPanel";

vi.mock("../hooks/useSystemDesignDiscussion", () => ({
    useSystemDesignDiscussion: () => ({ interjections: [], checking: false, checkpoint: vi.fn() }),
}));
vi.mock("../components/SystemDesignCanvas", () => ({
    default: () => <div data-testid="system-design-canvas">Canvas</div>,
}));

afterEach(() => cleanup());

describe("SystemDesignDiscussionPanel mountedRef resilience", () => {
    it("resets aiSpeaking after TTS finishes even if stopHandsFree's identity changes mid-utterance (e.g. StrictMode's mount/cleanup/remount cycle)", async () => {
        let resolveSpeak;
        const speakPromise = new Promise((resolve) => { resolveSpeak = resolve; });
        const speakNowSpy = vi.fn(() => speakPromise);
        const resumeHandsFreeSpy = vi.fn();
        let handsFreePaused = false;
        const pauseHandsFree = vi.fn(async () => { handsFreePaused = true; });
        const resumeHandsFree = vi.fn(async (target) => { handsFreePaused = false; resumeHandsFreeSpy(target); });

        const baseProps = {
            problem: "Design a URL shortening service like Bitly.",
            transcript: "",
            onTranscriptChange: vi.fn(),
            diagramData: "",
            onDiagramChange: vi.fn(),
            target: "system-design",
            checkpointEndpoint: "/checkpoint",
            supportsSTT: true,
            supportsTTS: true,
            listening: false,
            listeningTarget: null,
            micSessionActive: true,
            startHandsFree: vi.fn(),
            pauseHandsFree,
            resumeHandsFree,
            speakNow: speakNowSpy,
            onEnd: vi.fn(),
            requireCamera: false,
        };

        const { rerender } = render(
            <SystemDesignDiscussionPanel {...baseProps} handsFreePaused={false} stopHandsFree={() => {}} />,
        );

        await waitFor(() => expect(speakNowSpy).toHaveBeenCalled());
        // handsFreePaused flips to true (via pauseHandsFree) shortly after mount; reflect
        // that in a re-render, same as the real app would when the prop updates.
        await waitFor(() => expect(handsFreePaused).toBe(true));
        rerender(<SystemDesignDiscussionPanel {...baseProps} handsFreePaused stopHandsFree={() => {}} />);

        // Mid-utterance, the caller hands down a brand-new stopHandsFree reference — this is
        // exactly what happens on React StrictMode's dev-only mount -> cleanup -> remount
        // cycle, and what an unstable caller could also do on any later re-render.
        rerender(<SystemDesignDiscussionPanel {...baseProps} handsFreePaused stopHandsFree={() => {}} />);

        resolveSpeak(true);

        await waitFor(() => expect(resumeHandsFreeSpy).toHaveBeenCalled());
    });
});
