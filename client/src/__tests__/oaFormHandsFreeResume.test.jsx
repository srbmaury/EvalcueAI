import { useCallback, useEffect, useState } from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import OAForm from "../components/OAForm";

vi.mock("../components/CodeEditorField", () => ({
    default: ({ value, onChange }) => (
        <textarea aria-label="Mock answer editor" value={value} onChange={(event) => onChange(event.target.value)} />
    ),
}));
vi.mock("../components/SkipRoundButton", () => ({ default: () => <button type="button">Skip round</button> }));
vi.mock("../components/VoiceControls", () => ({ default: () => <button type="button">Replay question</button> }));

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe("OAForm hands-free resume", () => {
    it("resumes the mic once the interviewer finishes speaking, even when the voice callbacks change identity mid-utterance", async () => {
        let resolveSpeak;
        const speakPromise = new Promise((resolve) => { resolveSpeak = resolve; });
        const onSpeakSpy = vi.fn(() => speakPromise);
        const onPauseHandsFreeSpy = vi.fn();
        const onResumeHandsFreeSpy = vi.fn();
        const onStartHandsFreeSpy = vi.fn();

        function Harness() {
            // A parent that starts re-rendering with brand-new callback identities only once
            // the interviewer has actually started "speaking" — mirroring a real unrelated
            // re-render (e.g. auth context) that recreates onSpeak/onPauseHandsFree/
            // onResumeHandsFree/onStartHandsFree mid-utterance, since they are not guaranteed
            // referentially stable. Churning from the very first render would also cancel the
            // component's initial start/pause/speak sequence before it ever gets going, which
            // isn't the scenario this test targets.
            const [churn, setChurn] = useState(0);
            const [handsFreePaused, setHandsFreePaused] = useState(false);
            const [speakingStarted, setSpeakingStarted] = useState(false);

            useEffect(() => {
                if (!speakingStarted) return undefined;
                const id = setInterval(() => setChurn((count) => count + 1), 15);
                return () => clearInterval(id);
            }, [speakingStarted]);

            const onPauseHandsFree = useCallback(async () => {
                setHandsFreePaused(true);
                onPauseHandsFreeSpy();
                // eslint-disable-next-line react-hooks/exhaustive-deps
            }, [churn]);
            const onResumeHandsFree = useCallback(async (target) => {
                setHandsFreePaused(false);
                onResumeHandsFreeSpy(target);
                // eslint-disable-next-line react-hooks/exhaustive-deps
            }, [churn]);
            const onStartHandsFree = useCallback(async (target) => {
                onStartHandsFreeSpy(target);
                // eslint-disable-next-line react-hooks/exhaustive-deps
            }, [churn]);
            const onSpeak = useCallback((text) => {
                setSpeakingStarted(true);
                return onSpeakSpy(text);
                // eslint-disable-next-line react-hooks/exhaustive-deps
            }, [churn]);

            return (
                <OAForm
                    questions={[{ question: { text: "Implement a queue using two stacks." } }]}
                    answers={[""]}
                    spokenAnswers={[""]}
                    codingEnabled={[false]}
                    onCodingModeChange={vi.fn()}
                    codeDraftPrefix="round-dsa"
                    roundName="Data Structures and Algorithms"
                    onSpokenChange={vi.fn()}
                    onChange={vi.fn()}
                    onSubmit={vi.fn()}
                    onSkip={vi.fn()}
                    submitting={false}
                    supportsTTS
                    supportsSTT
                    listening={false}
                    listeningTarget={null}
                    onSpeak={onSpeak}
                    onStartListening={vi.fn()}
                    onStopListening={vi.fn()}
                    micPermission="granted"
                    micLevel={0}
                    micSessionActive
                    handsFreePaused={handsFreePaused}
                    onStartHandsFree={onStartHandsFree}
                    onPauseHandsFree={onPauseHandsFree}
                    onResumeHandsFree={onResumeHandsFree}
                    onStopHandsFree={vi.fn()}
                />
            );
        }

        render(<Harness />);

        await waitFor(() => expect(onPauseHandsFreeSpy).toHaveBeenCalled());
        await waitFor(() => expect(onSpeakSpy).toHaveBeenCalled(), { timeout: 3000 });

        // Let several churn re-renders land while the utterance is still in flight.
        await new Promise((resolve) => setTimeout(resolve, 90));
        expect(onResumeHandsFreeSpy).not.toHaveBeenCalled();

        resolveSpeak(true);

        await waitFor(() => expect(onResumeHandsFreeSpy).toHaveBeenCalled());
    });
});
