import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import {
    configuredSurface,
    deploymentRedirectUrl,
    deploymentSurfaceForPath,
    surfaceHomePath,
} from "../utils/deploymentSurface";

export default function DeploymentSurfaceGuard({ children }) {
    const location = useLocation();
    const deployedSurface = configuredSurface();
    const requestedSurface = deploymentSurfaceForPath(location.pathname);
    const isSurfaceRoot = location.pathname === "/";
    const shouldSwitchDomain = Boolean(
        !isSurfaceRoot && deployedSurface && requestedSurface && requestedSurface !== deployedSurface,
    );

    useEffect(() => {
        if (!shouldSwitchDomain) return;
        window.location.replace(deploymentRedirectUrl(
            deployedSurface,
            requestedSurface,
            `${location.pathname}${location.search}${location.hash}`,
        ));
    }, [deployedSurface, location.hash, location.pathname, location.search, requestedSurface, shouldSwitchDomain]);

    if (!deployedSurface) return children;
    if (isSurfaceRoot) return <Navigate to={surfaceHomePath(deployedSurface)} replace />;
    if (!shouldSwitchDomain) return children;

    return (
        <Box sx={{ minHeight: "60vh", display: "grid", placeItems: "center" }} role="status" aria-label="Opening Evalcue AI workspace">
            <CircularProgress />
        </Box>
    );
}
