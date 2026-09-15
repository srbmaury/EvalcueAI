import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useVoiceInput } from "../useVoiceInput";

describe("useVoiceInput callback stability", () => {
    it("keeps startHandsFree/resumeHandsFree/pauseHandsFree referentially stable across re-renders when the caller omits transcribeHeaders", () => {
        // Mirrors InterviewPage.jsx's call: useVoiceInput({ onTranscript }), with no
        // transcribeHeaders. An inline `{}` default parameter would be a fresh object on
        // every call, cascading through transcribeBlob -> startRecorderSegment ->
        // startHandsFree/resumeHandsFree and breaking any effect elsewhere (e.g. OAForm's
        // speak-then-resume sequence) that lists those callbacks as effect dependencies —
        // such an effect would be cancelled and restarted on every re-render of the caller,
        // even ones with no connection to voice state (like a once-a-second elapsed-time tick).
        const { result, rerender } = renderHook(() => useVoiceInput({ onTranscript: vi.fn() }));

        const first = {
            startHandsFree: result.current.startHandsFree,
            resumeHandsFree: result.current.resumeHandsFree,
            pauseHandsFree: result.current.pauseHandsFree,
        };

        rerender();
        rerender();
        rerender();

        expect(result.current.startHandsFree).toBe(first.startHandsFree);
        expect(result.current.resumeHandsFree).toBe(first.resumeHandsFree);
        expect(result.current.pauseHandsFree).toBe(first.pauseHandsFree);
    });
});
