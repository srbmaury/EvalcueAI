import { useContext } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { OrganizationContext } from "../context/OrganizationContext";
import { defaultWorkspaceFor, getWorkspaceHome, getWorkspacePreference } from "../utils/workspacePreference";
import { surfaceForPath, workspaceForSurface } from "../utils/productRoutes";

export default function GuestOnlyRoute({ children }) {
    const { user, loading } = useContext(AuthContext);
    const { organizations, organizationsReady } = useContext(OrganizationContext);
    const location = useLocation();

    // Guest-facing pages should paint immediately while session restoration runs in
    // the background. If a valid session is recovered, redirect on the next render.
    if (loading) return children;

    const requested = location.state?.from;
    const requestedDestination = requested?.pathname
        ? `${requested.pathname}${requested.search || ""}${requested.hash || ""}`
        : null;
    const workspaceParam = new URLSearchParams(location.search).get("workspace");
    const routeWorkspace = workspaceForSurface(surfaceForPath(location.pathname));
    const explicitWorkspace = ["practice", "hiring"].includes(workspaceParam) ? workspaceParam : routeWorkspace;
    const explicitWorkspaceDestination = explicitWorkspace ? getWorkspaceHome(explicitWorkspace) : null;
    const preferredWorkspace = getWorkspacePreference(user?._id);
    if (user && !requestedDestination && !explicitWorkspaceDestination && !preferredWorkspace && !organizationsReady) return children;
    const workspaceDestination = getWorkspaceHome(preferredWorkspace || defaultWorkspaceFor(organizations));

    return user ? <Navigate to={requestedDestination || explicitWorkspaceDestination || workspaceDestination} replace /> : children;
}
