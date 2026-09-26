import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import api from "../api/axios";
import { useSystemDesignDiscussion } from "../hooks/useSystemDesignDiscussion";

vi.mock("../api/axios", () => ({ default: { post: vi.fn() } }));

const Harness = ({ onInterjection, micLevel = 0, listening = true, interimText = "", interviewerSpeaking = false, body = null }) => {
    useSystemDesignDiscussion({
        enabled: true,
        endpoint: "/system-design/checkpoint",
        transcript: "",
        diagramData: "",
        interimText,
        micLevel,
        listening,
        interviewerSpeaking,
        intervalMs: 7000,
        onInterjection,
        body,
    });
    return null;
};

describe("system design silence intervention", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        api.post.mockReset();
        api.post.mockResolvedValue({
            data: {
                shouldInterrupt: true,
                interjection: "Let's get started—what requirements would you clarify first?",
                kind: "clarify",
            },
        });
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
    });

    it("forces the interviewer to step in after 15 seconds of candidate silence", async () => {
        const onInterjection = vi.fn();
        render(<Harness onInterjection={onInterjection} />);

        await act(async () => { vi.advanceTimersByTime(14999); await Promise.resolve(); });
        expect(api.post).not.toHaveBeenCalled();

        await act(async () => { vi.advanceTimersByTime(1); await Promise.resolve(); await Promise.resolve(); });
        expect(api.post).toHaveBeenCalledTimes(1);
        expect(api.post.mock.calls[0][1]).toMatchObject({ forceInteraction: true });
        expect(onInterjection).toHaveBeenCalledTimes(1);
    });

    it("sends caller-supplied fields such as the candidate round and question index", async () => {
        render(<Harness onInterjection={vi.fn()} body={{ roundIndex: 2, questionIndex: 0 }} />);
        await act(async () => { vi.advanceTimersByTime(15000); await Promise.resolve(); await Promise.resolve(); });
        expect(api.post.mock.calls[0][1]).toMatchObject({ roundIndex: 2, questionIndex: 0, forceInteraction: true });
    });

    it("does not interrupt while microphone activity shows the candidate is still speaking", async () => {
        const onInterjection = vi.fn();
        const view = render(<Harness onInterjection={onInterjection} micLevel={0} />);

        await act(async () => { vi.advanceTimersByTime(14000); });
        view.rerender(<Harness onInterjection={onInterjection} micLevel={0.2} />);
        await act(async () => { vi.advanceTimersByTime(14999); await Promise.resolve(); });
        expect(api.post).not.toHaveBeenCalled();

        await act(async () => { vi.advanceTimersByTime(1); await Promise.resolve(); await Promise.resolve(); });
        expect(api.post).toHaveBeenCalledTimes(1);
    });

    it("starts a fresh 15-second candidate window after interviewer speech finishes", async () => {
        const onInterjection = vi.fn();
        const view = render(<Harness onInterjection={onInterjection} />);

        await act(async () => { vi.advanceTimersByTime(14000); });
        view.rerender(<Harness onInterjection={onInterjection} interviewerSpeaking />);
        await act(async () => { vi.advanceTimersByTime(5000); });
        expect(api.post).not.toHaveBeenCalled();

        view.rerender(<Harness onInterjection={onInterjection} interviewerSpeaking={false} />);
        await act(async () => { vi.advanceTimersByTime(14999); await Promise.resolve(); });
        expect(api.post).not.toHaveBeenCalled();

        await act(async () => { vi.advanceTimersByTime(1); await Promise.resolve(); await Promise.resolve(); });
        expect(api.post).toHaveBeenCalledTimes(1);
    });
});
