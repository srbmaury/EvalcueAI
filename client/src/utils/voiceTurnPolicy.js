// Technical answers include thinking pauses ("let me think about the data model..."), so wait longer
// than a conversational assistant would, and show a countdown for the final stretch.
export const DEFAULT_VOICE_SILENCE_MS = 8000;
export const AUTO_SUBMIT_COUNTDOWN_MS = 3000;

// Whole seconds left before an auto-submit, or null when no countdown should be shown.
export const autoSubmitCountdownSeconds = (silenceMs, thresholdMs = DEFAULT_VOICE_SILENCE_MS) => {
    const remaining = Number(thresholdMs) - Number(silenceMs);
    if (!Number.isFinite(remaining) || remaining <= 0 || remaining > AUTO_SUBMIT_COUNTDOWN_MS) return null;
    return Math.ceil(remaining / 1000);
};

export const shouldAutoSubmitVoiceTurn = ({
    answer = "",
    silenceMs = 0,
    thresholdMs = DEFAULT_VOICE_SILENCE_MS,
    isListening = false,
    micSessionActive = false,
    aiSpeaking = false,
    hasInterimText = false,
    typedWorkspaceVisible = false,
    codingEnabled = false,
    submitting = false,
    readinessNeeded = false,
} = {}) => Boolean(
    answer.toString().trim()
    && Number(silenceMs) >= Number(thresholdMs)
    && isListening
    && micSessionActive
    && !aiSpeaking
    && !hasInterimText
    && !typedWorkspaceVisible
    && !codingEnabled
    && !submitting
    && !readinessNeeded
);
