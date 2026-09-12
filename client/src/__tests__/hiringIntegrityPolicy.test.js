import { describe, expect, it } from "vitest";
import { canStartHiringAssessment } from "../utils/hiringIntegrityPolicy";

describe("hiring integrity start policy", () => {
    it("requires camera readiness and fullscreen when configured regardless of invite mode", () => {
        const integrity = { enabled: true, requireCamera: true, requireFullscreen: true };
        expect(canStartHiringAssessment({ integrity, cameraReady: false, fullscreenActive: true })).toBe(false);
        expect(canStartHiringAssessment({ integrity, cameraReady: true, fullscreenActive: false })).toBe(false);
        expect(canStartHiringAssessment({ integrity, cameraReady: true, fullscreenActive: true })).toBe(true);
    });

    it("allows start when integrity requirements are disabled", () => {
        expect(canStartHiringAssessment({ integrity: { enabled: false }, cameraReady: false, fullscreenActive: false })).toBe(true);
    });
});
