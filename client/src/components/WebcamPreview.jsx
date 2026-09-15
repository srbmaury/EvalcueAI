import { useCallback, useEffect, useRef, useState, memo } from "react";
import { Box, Chip, Tooltip, Typography } from "@mui/material";
import PersonIcon from "@mui/icons-material/Person";
import VideocamRoundedIcon from "@mui/icons-material/VideocamRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import { useFacePresenceMonitor } from "../hooks/useFacePresenceMonitor";

const WebcamPreview = ({ autoStart = false, required = false, monitorFaces = false, onIntegrityEvent, onFaceStatusChange, onCameraStatusChange }) => {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const [on, setOn] = useState(false);
    const [denied, setDenied] = useState(false);
    const [selfViewHidden, setSelfViewHidden] = useState(false);
    const [videoElement, setVideoElement] = useState(null);
    const faceStatus = useFacePresenceMonitor({ enabled: monitorFaces && on, video: videoElement, stream: streamRef.current, onEvent: onIntegrityEvent });
    const setVideoRef = useCallback((element) => { videoRef.current = element; setVideoElement(element); }, []);

    const start = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "user", width: 480, height: 360 },
                audio: false,
            });
            streamRef.current = stream;
            stream.getVideoTracks()[0]?.addEventListener("ended", () => {
                streamRef.current = null;
                setOn(false);
                setSelfViewHidden(false);
            }, { once: true });
            setOn(true);
            setDenied(false);
        } catch {
            setDenied(true);
        }
    }, []);

    useEffect(() => {
        if (on && videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current;
    }, [on]);

    useEffect(() => {
        onCameraStatusChange?.({ on, denied });
    }, [denied, on, onCameraStatusChange]);

    const stop = (event) => {
        event?.stopPropagation();
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        setOn(false);
        setSelfViewHidden(false);
    };

    useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);
    useEffect(() => { if (autoStart) start(); }, [autoStart, start]);
    useEffect(() => { onFaceStatusChange?.(faceStatus); }, [faceStatus, onFaceStatusChange]);

    const enableCamera = () => { if (!on) start(); };
    const onKeyDown = (event) => {
        if (!on && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            start();
        }
    };

    return (
        <Tooltip
            title={on
                ? selfViewHidden ? "Camera is still on. Show your self-view." : required ? "Camera is required during this interview" : "Your camera preview"
                : denied ? "Camera access is blocked. Check your browser permissions." : "Turn on your camera preview"}
            placement="left"
        >
            <Box
                onClick={enableCamera}
                onKeyDown={onKeyDown}
                role={!on ? "button" : undefined}
                tabIndex={!on ? 0 : undefined}
                aria-label={!on ? "Turn on camera" : selfViewHidden ? "Camera on, self-view hidden" : "Your camera preview"}
                sx={{
                    position: "absolute",
                    bottom: { xs: 10, sm: 14 },
                    right: { xs: 10, sm: 14 },
                    // Floating self-view tile: always stack above sibling content (canvas
                    // libraries like Excalidraw create their own high-z-index layers that
                    // would otherwise cover it regardless of DOM order).
                    zIndex: 5,
                    width: { xs: 112, sm: 148 },
                    height: { xs: 84, sm: 111 },
                    borderRadius: 2.5,
                    overflow: "hidden",
                    bgcolor: "#111827",
                    border: "2px solid rgba(255,255,255,0.18)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "column",
                    gap: .5,
                    cursor: on ? "default" : "pointer",
                    boxShadow: "0 8px 28px rgba(0,0,0,.35)",
                    transition: "border-color .2s, transform .2s, box-shadow .2s",
                    "&:hover": on ? undefined : { borderColor: "rgba(255,255,255,.5)", transform: "translateY(-1px)" },
                    "&:focus-visible": { outline: "3px solid #60a5fa", outlineOffset: 2 },
                }}
            >
                {on ? (
                    <>
                        <video
                            ref={setVideoRef}
                            autoPlay
                            muted
                            playsInline
                            style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)", opacity: selfViewHidden ? 0 : 1 }}
                        />
                        {selfViewHidden && (
                            <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", px: 1.5, bgcolor: "#111827" }}>
                                <Box>
                                    <VisibilityOffRoundedIcon sx={{ color: "rgba(255,255,255,.68)", fontSize: 25 }} />
                                    <Typography sx={{ color: "rgba(255,255,255,.78)", fontSize: 9.5, fontWeight: 650 }}>Camera on</Typography>
                                    <Typography sx={{ color: "rgba(255,255,255,.52)", fontSize: 8.5 }}>Self-view hidden</Typography>
                                </Box>
                            </Box>
                        )}
                    </>
                ) : (
                    <>
                        {denied ? <PersonIcon sx={{ color: "error.light", fontSize: 30 }} /> : <VideocamRoundedIcon sx={{ color: "rgba(255,255,255,.62)", fontSize: 30 }} />}
                        <Typography sx={{ color: denied ? "error.light" : "rgba(255,255,255,.75)", fontSize: 10, textAlign: "center", px: 1, fontWeight: 650 }}>
                            {denied ? "Camera blocked" : required ? "Turn camera on" : "Turn camera on"}
                        </Typography>
                    </>
                )}

                <Box sx={{ position: "absolute", bottom: 0, left: 0, right: 0, px: .75, pb: .5, pt: 2.5, background: "linear-gradient(transparent, rgba(0,0,0,.78))", display: "flex", justifyContent: "space-between", alignItems: "center", pointerEvents: "none" }}>
                    <Typography sx={{ color: "rgba(255,255,255,.9)", fontSize: 10, fontWeight: 700 }}>{selfViewHidden ? "Camera on" : "You"}</Typography>
                    {required && on && <Chip size="small" label="Required" sx={{ height: 18, fontSize: 9, bgcolor: "rgba(255,255,255,.16)", color: "white" }} />}
                    {on && (
                        <Typography
                            component="button"
                            onClick={(event) => { event.stopPropagation(); if (required) setSelfViewHidden((value) => !value); else stop(event); }}
                            aria-label={required ? selfViewHidden ? "Show self view" : "Hide self view" : "Turn off camera"}
                            sx={{ pointerEvents: "auto", border: 0, bgcolor: "transparent", p: 0, color: "rgba(255,255,255,.7)", fontSize: 10, cursor: "pointer", "&:hover": { color: "white" } }}
                        >
                            {required ? selfViewHidden ? "Show" : "Hide" : "Turn off"}
                        </Typography>
                    )}
                </Box>
            </Box>
        </Tooltip>
    );
};

export default memo(WebcamPreview);
