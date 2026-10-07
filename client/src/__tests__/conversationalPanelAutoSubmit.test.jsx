import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ConversationalPanel from "../components/ConversationalPanel";

const baseProps = {
    convSubmitting: false,
    convRoundSubmitting: false,
    convState: { current: { text: "How would you design an idempotent payments API?" }, index: 0, done: false },
    setConvAnswer: () => {},
    supportsTTS: false,
    supportsSTT: true,
    listening: true,
    listeningTarget: "conv",
    micSessionActive: true,
    isSpeaking: false,
    autoSubmitVoiceOnSilence: true,
    requireCameraBeforeStart: false,
    autoStartCamera: false,
};

describe("ConversationalPanel silence auto-submit", () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    // Regression: the interval that detects silence was created while the answer was still empty, and it
    // called the onSubmitAnswer from that render, so the submitted answer was "" even though the spoken one
    // was not. It must use the handler from the latest render.
    it("submits with the latest handler, not the one from before the answer was spoken", async () => {
        const staleSubmit = vi.fn();
        const latestSubmit = vi.fn();
        const { rerender } = render(<ConversationalPanel {...baseProps} convAnswer="" onSubmitAnswer={staleSubmit} />);
        rerender(<ConversationalPanel {...baseProps} convAnswer="Use an idempotency key with a unique constraint." onSubmitAnswer={latestSubmit} />);

        await act(async () => { vi.advanceTimersByTime(9000); });

        expect(latestSubmit).toHaveBeenCalledTimes(1);
        expect(staleSubmit).not.toHaveBeenCalled();
    });

    it("never auto-submits while nothing has been said", async () => {
        const submit = vi.fn();
        render(<ConversationalPanel {...baseProps} convAnswer="" onSubmitAnswer={submit} />);

        await act(async () => { vi.advanceTimersByTime(20000); });

        expect(submit).not.toHaveBeenCalled();
    });
});
