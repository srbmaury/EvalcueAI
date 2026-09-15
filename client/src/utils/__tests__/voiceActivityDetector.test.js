import { describe, expect, it } from "vitest";
import {
    advanceVad,
    createVadState,
    VAD_CALIBRATION_MS,
    VAD_DEFAULT_THRESHOLD,
    VAD_HYSTERESIS_EXIT_RATIO,
    VAD_MAX_THRESHOLD,
    VAD_MIN_THRESHOLD,
} from "../voiceActivityDetector";

const feed = (state, levels, { start = 0, stepMs = 33 } = {}) => {
    let current = state;
    let now = start;
    for (const level of levels) {
        current = advanceVad(current, level, now);
        now += stepMs;
    }
    return current;
};

describe("voiceActivityDetector", () => {
    it("starts uncalibrated with the default threshold and not speaking", () => {
        const state = createVadState(0);
        expect(state.noiseFloor).toBeNull();
        expect(state.threshold).toBe(VAD_DEFAULT_THRESHOLD);
        expect(state.speaking).toBe(false);
    });

    it("calibrates a noise floor from ambient levels during the first calibration window", () => {
        const start = 0;
        let state = createVadState(start);
        // 21 quiet frames spanning (and one past) the calibration window, so the last frame
        // observes elapsed >= VAD_CALIBRATION_MS and triggers the average computation.
        const quietLevels = Array.from({ length: 21 }, () => 0.01);
        state = feed(state, quietLevels, { start, stepMs: VAD_CALIBRATION_MS / (quietLevels.length - 1) });
        expect(state.noiseFloor).not.toBeNull();
        expect(state.noiseFloor).toBeGreaterThan(0);
        expect(state.noiseFloor).toBeLessThan(0.02);
    });

    it("derives a higher speech threshold in a noisier room than in a quiet one", () => {
        const framesFor = (level) => Array.from({ length: 21 }, () => level);

        let quiet = createVadState(0);
        quiet = feed(quiet, framesFor(0.008), { stepMs: VAD_CALIBRATION_MS / 20 });

        let noisy = createVadState(0);
        noisy = feed(noisy, framesFor(0.03), { stepMs: VAD_CALIBRATION_MS / 20 });

        expect(quiet.noiseFloor).not.toBeNull();
        expect(noisy.noiseFloor).not.toBeNull();
        expect(noisy.threshold).toBeGreaterThan(quiet.threshold);
        expect(noisy.threshold).toBeLessThanOrEqual(VAD_MAX_THRESHOLD);
        expect(quiet.threshold).toBeGreaterThanOrEqual(VAD_MIN_THRESHOLD);
    });

    it("flips to speaking once smoothed level crosses the calibrated threshold, after calibration completes", () => {
        let state = createVadState(0);
        // Calibrate against near-silence first.
        state = feed(state, Array.from({ length: 20 }, () => 0.005), { stepMs: VAD_CALIBRATION_MS / 20 });
        expect(state.speaking).toBe(false);

        // Sustained loud speech should eventually flip isSpeaking to true, once the
        // exponential smoothing catches up with the raw level.
        for (let i = 0; i < 10 && !state.speaking; i++) {
            state = advanceVad(state, 0.4, 1000 + i * 33);
        }
        expect(state.speaking).toBe(true);
    });

    it("does not flicker off during a brief dip that stays above the lower exit threshold (hysteresis)", () => {
        let state = createVadState(0);
        state = feed(state, Array.from({ length: 20 }, () => 0.005), { stepMs: VAD_CALIBRATION_MS / 20 });
        for (let i = 0; i < 10 && !state.speaking; i++) state = advanceVad(state, 0.4, 1000 + i * 33);
        expect(state.speaking).toBe(true);

        const enterThreshold = state.threshold;
        const exitThreshold = enterThreshold * VAD_HYSTERESIS_EXIT_RATIO;
        // Dip below the *enter* threshold but keep it above the *exit* threshold — a naive
        // single-threshold check would drop out here; hysteresis should hold "speaking".
        const dipLevel = (enterThreshold + exitThreshold) / 2;
        state = advanceVad(state, dipLevel, 2000);
        expect(state.speaking).toBe(true);
    });

    it("flips back to not-speaking once level drops below the exit threshold", () => {
        let state = createVadState(0);
        state = feed(state, Array.from({ length: 20 }, () => 0.005), { stepMs: VAD_CALIBRATION_MS / 20 });
        for (let i = 0; i < 10 && !state.speaking; i++) state = advanceVad(state, 0.4, 1000 + i * 33);
        expect(state.speaking).toBe(true);

        for (let i = 0; i < 15 && state.speaking; i++) {
            state = advanceVad(state, 0, 2000 + i * 33);
        }
        expect(state.speaking).toBe(false);
    });

    it("clamps out-of-range or non-finite raw levels instead of propagating garbage", () => {
        let state = createVadState(0);
        state = advanceVad(state, Number.NaN, 0);
        expect(Number.isFinite(state.smoothedLevel)).toBe(true);
        state = advanceVad(state, 5, 33);
        expect(state.smoothedLevel).toBeLessThanOrEqual(1);
        state = advanceVad(state, -5, 66);
        expect(state.smoothedLevel).toBeGreaterThanOrEqual(0);
    });

    it("is a pure function: does not mutate the state object passed in", () => {
        const state = createVadState(0);
        const snapshotSamples = state.noiseSamples;
        const next = advanceVad(state, 0.01, 10);
        expect(state.noiseSamples).toBe(snapshotSamples);
        expect(next).not.toBe(state);
    });
});
