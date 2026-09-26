import { describe, expect, it } from "vitest";
import { advanceVad, createVadState, VAD_CALIBRATION_MS, VAD_MIN_THRESHOLD } from "../utils/voiceActivityDetector";

// Drive the detector with a sequence of raw levels, one frame every 16 ms (about 60 fps).
const run = (levels, start = 0) => levels.reduce(
    ({ state, now }, level) => ({ state: advanceVad(state, level, now + 16), now: now + 16 }),
    { state: createVadState(start), now: start },
);

describe("voice activity detection", () => {
    it("calibrates to a quiet room and then detects speech", () => {
        const quiet = Array(Math.ceil(VAD_CALIBRATION_MS / 16) + 2).fill(0.004);
        const { state, now } = run(quiet);
        expect(state.noiseFloor).not.toBeNull();
        expect(state.threshold).toBe(VAD_MIN_THRESHOLD);
        const speaking = [0.2, 0.2, 0.2, 0.2].reduce((current, level, i) => advanceVad(current, level, now + (i + 1) * 16), state);
        expect(speaking.speaking).toBe(true);
    });

    it("keeps a usable threshold when the candidate talks during calibration", () => {
        // First third quiet, then speech for the rest of the calibration window.
        const frames = Math.ceil(VAD_CALIBRATION_MS / 16) + 2;
        const levels = Array.from({ length: frames }, (_, i) => (i < frames / 3 ? 0.004 : 0.18));
        const { state } = run(levels);
        // A mean-based floor would push the threshold toward the maximum and miss quiet speakers.
        expect(state.threshold).toBeLessThan(0.05);
    });

    it("uses hysteresis so borderline levels do not flicker", () => {
        const { state, now } = run(Array(Math.ceil(VAD_CALIBRATION_MS / 16) + 2).fill(0.004));
        let current = [0.2, 0.2, 0.2, 0.2].reduce((acc, level, i) => advanceVad(acc, level, now + (i + 1) * 16), state);
        expect(current.speaking).toBe(true);
        // Dropping just below the entry threshold keeps the speaking state.
        current = advanceVad(current, current.threshold * 0.9, now + 200);
        expect(current.speaking).toBe(true);
    });
});
