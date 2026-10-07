import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebcamPreview from "../components/WebcamPreview";
import { cameraFailureKind } from "../utils/cameraFailure";

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

const stubGetUserMedia = (impl) => vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia: vi.fn(impl) } });

describe("WebcamPreview status", () => {
    it("says it is waiting while the browser permission prompt is open", async () => {
        stubGetUserMedia(() => new Promise(() => {}));
        const onStatus = vi.fn();
        render(<WebcamPreview required onCameraStatusChange={onStatus} />);

        fireEvent.click(screen.getByRole("button", { name: "Turn on camera" }));

        expect(await screen.findByText("Allow camera access…")).toBeTruthy();
        await waitFor(() => expect(onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ requesting: true, on: false })));
    });

    it("tells a camera that is in use apart from one that is blocked", async () => {
        stubGetUserMedia(() => Promise.reject(Object.assign(new Error("busy"), { name: "NotReadableError" })));
        const onStatus = vi.fn();
        render(<WebcamPreview required onCameraStatusChange={onStatus} />);

        fireEvent.click(screen.getByRole("button", { name: "Turn on camera" }));

        expect(await screen.findByText("Camera in use")).toBeTruthy();
        expect(onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ denied: true, failure: "busy", requesting: false }));
    });

    it("classifies getUserMedia failures by what the person can do", () => {
        expect(cameraFailureKind({ name: "NotAllowedError" })).toBe("blocked");
        expect(cameraFailureKind({ name: "NotFoundError" })).toBe("missing");
        expect(cameraFailureKind({ name: "NotReadableError" })).toBe("busy");
        expect(cameraFailureKind(undefined)).toBe("blocked");
    });
});
