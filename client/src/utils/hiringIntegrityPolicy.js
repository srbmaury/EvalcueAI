export const integrityRequirements = (integrity = {}) => ({
    enabled: Boolean(integrity?.enabled),
    requireCamera: Boolean(integrity?.enabled && integrity?.requireCamera),
    requireFullscreen: Boolean(integrity?.enabled && integrity?.requireFullscreen),
});

export const canStartHiringAssessment = ({ integrity = {}, cameraReady = false, fullscreenActive = false }) => {
    const requirements = integrityRequirements(integrity);
    if (!requirements.enabled) return true;
    if (requirements.requireCamera && !cameraReady) return false;
    if (requirements.requireFullscreen && !fullscreenActive) return false;
    return true;
};

export const integrityRecoveryReason = ({ integrity = {}, cameraReady = true, fullscreenActive = true }) => {
    const requirements = integrityRequirements(integrity);
    if (requirements.requireCamera && !cameraReady) return "camera";
    if (requirements.requireFullscreen && !fullscreenActive) return "fullscreen";
    return "";
};
