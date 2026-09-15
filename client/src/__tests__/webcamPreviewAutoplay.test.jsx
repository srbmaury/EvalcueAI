import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebcamPreview from "../components/WebcamPreview";

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe("WebcamPreview autoplay", () => {
    beforeEach(() => {
        const track = { stop: vi.fn(), addEventListener: vi.fn() };
        const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
        vi.stubGlobal("navigator", {
            ...navigator,
            mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
            permissions: navigator.permissions,
        });
        // jsdom's HTMLMediaElement doesn't implement play(); the autoPlay attribute alone
        // is exactly the thing this test guards against relying on, since real browsers can
        // silently skip it (e.g. a backgrounded tab), leaving the preview frozen with no error.
        window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    });

    it("explicitly calls play() once the camera stream attaches, instead of relying on the autoPlay attribute alone", async () => {
        render(<WebcamPreview autoStart required />);

        await waitFor(() => expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled());
    });
});
