import { useContext } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import { AuthContext } from "../context/AuthContext";
import { getWorkspaceHome, getWorkspacePreference } from "../utils/workspacePreference";
import { surfaceForPath, workspaceForSurface } from "../utils/productRoutes";
import { configuredSurface } from "../utils/deploymentSurface";

export default function GuestOnlyRoute({ children }) {
    const { user, loading } = useContext(AuthContext);
    const location = useLocation();

    if (loading) return <Box sx={{ minHeight: "60vh", display: "grid", placeItems: "center" }}><CircularProgress /></Box>;

    // The common landing deployment must remain reachable even for signed-in
    // users because it is the only bridge between Practice and Hire domains.
    if (user && configuredSurface() === "landing" && location.pathname === "/") {
        return children;
    }

    const requested = location.state?.from;
    const requestedDestination = requested?.pathname
        ? `${requested.pathname}${requested.search || ""}${requested.hash || ""}`
        : null;
    const workspaceParam = new URLSearchParams(location.search).get("workspace");
    const routeWorkspace = workspaceForSurface(surfaceForPath(location.pathname));
    const explicitWorkspace = ["practice", "hiring"].includes(workspaceParam) ? workspaceParam : routeWorkspace;
    const explicitWorkspaceDestination = explicitWorkspace ? getWorkspaceHome(explicitWorkspace) : null;
    const workspaceDestination = getWorkspaceHome(getWorkspacePreference(user?._id) || "practice");

    return user ? <Navigate to={requestedDestination || explicitWorkspaceDestination || workspaceDestination} replace /> : children;
}
