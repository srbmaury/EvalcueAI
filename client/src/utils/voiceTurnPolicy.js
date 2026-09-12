export const DEFAULT_VOICE_SILENCE_MS = 5000;

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
