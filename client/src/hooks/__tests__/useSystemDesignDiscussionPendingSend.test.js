import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSystemDesignDiscussion } from "../useSystemDesignDiscussion";

const { post } = vi.hoisted(() => ({ post: vi.fn(async () => ({ data: { shouldInterrupt: false } })) }));
vi.mock("../../api/axios", () => ({ default: { post } }));

const setHidden = (hidden) => Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });

afterEach(() => { setHidden(false); vi.clearAllMocks(); });

describe("useSystemDesignDiscussion pending sends", () => {
    it("sends a forced check that was skipped while the tab was hidden once the tab is visible again", async () => {
        const { result } = renderHook(() => useSystemDesignDiscussion({
            enabled: true,
            endpoint: "/questions/r1/system-design/checkpoint",
            transcript: "Short typed reply",
        }));

        setHidden(true);
        await act(async () => { await result.current.checkpoint({ force: true }); });
        expect(post).not.toHaveBeenCalled();

        setHidden(false);
        await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });

        expect(post).toHaveBeenCalledTimes(1);
        expect(post.mock.calls[0][1]).toMatchObject({ forceInteraction: true, transcript: "Short typed reply" });
    });

    it("does not resend once the pending check has gone out", async () => {
        const { result } = renderHook(() => useSystemDesignDiscussion({
            enabled: true,
            endpoint: "/questions/r1/system-design/checkpoint",
            transcript: "Short typed reply",
        }));

        await act(async () => { await result.current.checkpoint({ force: true }); });
        await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });

        expect(post).toHaveBeenCalledTimes(1);
    });
});
