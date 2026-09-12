export const candidateTranscriptionConfig = ({ shareToken, attemptId, attemptToken, capabilities = {} }) => ({
    enabled: capabilities?.transcription !== false,
    endpoint: shareToken && attemptId ? `/assessments/public/${shareToken}/attempts/${attemptId}/transcribe` : "",
    headers: attemptToken ? { "x-attempt-token": attemptToken } : {},
});
