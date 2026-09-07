import { PRODUCT_SURFACES, surfaceForPath } from "./productRoutes";

const normalizeOrigin = (value = "") => String(value).trim().replace(/\/+$/, "");

export const configuredSurface = (value = import.meta?.env?.VITE_APP_SURFACE) => (
    ["landing", PRODUCT_SURFACES.PRACTICE, PRODUCT_SURFACES.HIRING].includes(value) ? value : null
);

export const surfaceHomePath = (surface) => (
    surface === PRODUCT_SURFACES.HIRING ? "/hire" : surface === PRODUCT_SURFACES.PRACTICE ? "/practice" : "/"
);

export const deploymentOrigins = (env = import.meta?.env || {}) => ({
    landing: normalizeOrigin(env.VITE_LANDING_ORIGIN),
    practice: normalizeOrigin(env.VITE_PRACTICE_ORIGIN),
    hiring: normalizeOrigin(env.VITE_HIRING_ORIGIN),
});

export const deploymentSurfaceForPath = (pathname = "") => (
    pathname === "/assessment" || pathname.startsWith("/assessment/")
        ? PRODUCT_SURFACES.PRACTICE
        : pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/sso/callback"
            ? PRODUCT_SURFACES.HIRING
            : surfaceForPath(pathname) || "landing"
);

export const externalSurfaceUrl = (surface, pathname, env = import.meta?.env || {}) => {
    const origin = deploymentOrigins(env)[surface];
    return origin ? `${origin}${pathname || surfaceHomePath(surface)}` : (pathname || surfaceHomePath(surface));
};

export const deploymentRedirectUrl = (deployedSurface, requestedSurface, pathname, env = import.meta?.env || {}) => {
    if (!deployedSurface || !requestedSurface || deployedSurface === requestedSurface) return null;

    // Product deployments are deliberately isolated. Users return to the common
    // site before entering the other product; only the common site links to both.
    if (deployedSurface !== "landing" && requestedSurface !== "landing") {
        return externalSurfaceUrl("landing", "/", env);
    }

    return externalSurfaceUrl(requestedSurface, pathname, env);
};
