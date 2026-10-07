export const CAMERA_FAILURE_COPY = {
    blocked: { label: "Camera blocked", hint: "Camera access is blocked. Allow it in your browser's site settings, then click the tile again." },
    missing: { label: "No camera found", hint: "No camera was found. Connect one, then click the tile again." },
    busy: { label: "Camera in use", hint: "Another app or tab is using the camera. Close it, then click the tile again." },
};

// getUserMedia rejects with a DOMException whose name says why; group them by what the person can do.
export const cameraFailureKind = (error) => {
    const name = error?.name || "";
    if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") return "missing";
    if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "busy";
    return "blocked";
};
