import { useEffect, useRef, useState } from "react";
import { createFacePresenceState, evaluateFacePresence } from "../utils/facePresencePolicy";

const WASM_ROOT = "/vendor/mediapipe/wasm";
const MODEL_PATH = "/models/blaze_face_short_range.tflite";

export function useFacePresenceMonitor({ enabled, video, stream, onEvent }) {
    const [status, setStatus] = useState(enabled ? "loading" : "off");
    const detectorRef = useRef(null);
    const policyRef = useRef(createFacePresenceState());
    const unavailableRecordedRef = useRef(false);

    useEffect(() => {
        if (!enabled || !video || !stream) { setStatus(enabled ? "loading" : "off"); return undefined; }
        let cancelled = false;
        let timer;
        const recordUnavailable = (reason) => {
            setStatus("unavailable");
            if (!unavailableRecordedRef.current) {
                unavailableRecordedRef.current = true;
                onEvent?.("face_detection_unavailable", { reason });
            }
        };
        const track = stream.getVideoTracks()[0];
        const interrupted = () => { setStatus("camera_interrupted"); onEvent?.("camera_interrupted", { reason: track?.readyState || "ended" }); };
        track?.addEventListener("ended", interrupted, { once: true });

        (async () => {
            try {
                const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
                const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
                if (cancelled) return;
                const createDetector = (delegate) => FaceDetector.createFromOptions(fileset, {
                    baseOptions: { modelAssetPath: MODEL_PATH, delegate },
                    runningMode: "VIDEO",
                    minDetectionConfidence: 0.6,
                });
                let detector;
                try {
                    detector = await createDetector("GPU");
                } catch {
                    // Some browsers/devices lack a WebGL-backed GPU delegate for the WASM
                    // runtime; fall back to CPU rather than disabling face monitoring outright.
                    if (cancelled) return;
                    detector = await createDetector("CPU");
                }
                if (cancelled) { detector?.close?.(); return; }
                detectorRef.current = detector;
                setStatus("checking");
                timer = window.setInterval(() => {
                    if (video.readyState < 2 || track?.readyState !== "live") return;
                    try {
                        const count = detectorRef.current.detectForVideo(video, performance.now()).detections.length;
                        const result = evaluateFacePresence(policyRef.current, count, Date.now());
                        policyRef.current = result.state;
                        setStatus(result.status);
                        if (result.event) onEvent?.(result.event.type, result.event.metadata);
                    } catch { recordUnavailable("detection_failed"); window.clearInterval(timer); }
                }, 1000);
            } catch { recordUnavailable("model_unavailable"); }
        })();

        return () => {
            cancelled = true;
            window.clearInterval(timer);
            track?.removeEventListener("ended", interrupted);
            detectorRef.current?.close?.();
            detectorRef.current = null;
            policyRef.current = createFacePresenceState();
        };
    }, [enabled, onEvent, stream, video]);

    return status;
}
