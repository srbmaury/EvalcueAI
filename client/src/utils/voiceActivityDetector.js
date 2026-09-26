// Voice-activity detection tuning. Rather than a single fixed amplitude threshold (which
// misfires in noisy rooms and misses quiet speakers), we calibrate against each session's own
// ambient noise floor, smooth the raw signal to avoid jitter, and use two thresholds (enter
// higher than exit) so borderline levels don't flicker the speaking state on and off.
export const VAD_CALIBRATION_MS = 700;
export const VAD_DEFAULT_THRESHOLD = 0.035;
export const VAD_MIN_THRESHOLD = 0.026;
export const VAD_MAX_THRESHOLD = 0.14;
export const VAD_NOISE_MULTIPLIER = 2.5;
export const VAD_NOISE_MARGIN = 0.008;
export const VAD_HYSTERESIS_EXIT_RATIO = 0.62;
export const VAD_LEVEL_SMOOTHING_ALPHA = 0.35;
export const VAD_NOISE_PERCENTILE = 0.2;

const percentile = (values, ratio) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(ratio * sorted.length))];
};

export const createVadState = (now = Date.now()) => ({
    calibrationStart: now,
    noiseSamples: [],
    noiseFloor: null,
    threshold: VAD_DEFAULT_THRESHOLD,
    smoothedLevel: 0,
    speaking: false,
});

/**
 * Advances voice-activity detection by one audio frame. Pure function: returns a new state,
 * never mutates the one passed in, so it can be driven frame-by-frame from a real analyser
 * loop or from a test with synthetic levels and timestamps.
 */
export const advanceVad = (state, rawLevel, now = Date.now()) => {
    const clampedRaw = Number.isFinite(rawLevel) ? Math.min(1, Math.max(0, rawLevel)) : 0;
    const smoothedLevel = state.smoothedLevel + (clampedRaw - state.smoothedLevel) * VAD_LEVEL_SMOOTHING_ALPHA;

    let { noiseFloor, threshold, noiseSamples } = state;
    if (noiseFloor === null) {
        const elapsed = now - state.calibrationStart;
        if (elapsed < VAD_CALIBRATION_MS) {
            noiseSamples = [...noiseSamples, smoothedLevel];
        } else {
            // A low percentile rather than the mean: if the candidate starts talking during the
            // calibration window, speech frames would inflate a mean and make quiet speakers
            // undetectable for the rest of the session. The quiet frames still describe the room.
            const floor = percentile(noiseSamples, VAD_NOISE_PERCENTILE);
            noiseFloor = floor;
            threshold = Math.min(VAD_MAX_THRESHOLD, Math.max(VAD_MIN_THRESHOLD, floor * VAD_NOISE_MULTIPLIER + VAD_NOISE_MARGIN));
        }
    }

    const enterThreshold = threshold;
    const exitThreshold = enterThreshold * VAD_HYSTERESIS_EXIT_RATIO;
    let speaking = state.speaking;
    if (!speaking && smoothedLevel >= enterThreshold) speaking = true;
    else if (speaking && smoothedLevel < exitThreshold) speaking = false;

    return { calibrationStart: state.calibrationStart, noiseSamples, noiseFloor, threshold, smoothedLevel, speaking };
};
