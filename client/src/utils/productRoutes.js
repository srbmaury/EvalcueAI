export const PRODUCT_SURFACES = Object.freeze({
    PRACTICE: "practice",
    HIRING: "hiring",
});

export const workspaceForSurface = (surface) => (
    surface === PRODUCT_SURFACES.HIRING
        ? "hiring"
        : surface === PRODUCT_SURFACES.PRACTICE
            ? "practice"
            : null
);

export const surfaceForWorkspace = (workspace) => (
    workspace === "hiring"
        ? PRODUCT_SURFACES.HIRING
        : workspace === "practice"
            ? PRODUCT_SURFACES.PRACTICE
            : null
);

export const surfaceForPath = (pathname = "") => {
    if (/^\/hire(?:\/|$)/.test(pathname)) {
        return PRODUCT_SURFACES.HIRING;
    }

    if (/^\/practice(?:\/|$)/.test(pathname)) {
        return PRODUCT_SURFACES.PRACTICE;
    }

    return null;
};

export const productLandingPath = (workspace) => (
    workspace === "hiring" ? "/hire" : "/practice"
);

export const productHomePath = (workspace) => (
    workspace === "hiring" ? "/hire/assessments" : "/practice/dashboard"
);

export const productLoginPath = (workspace) => (
    workspace === "hiring" ? "/hire/login" : workspace === "practice" ? "/practice/login" : "/login"
);

export const productRegisterPath = (workspace) => (
    workspace === "hiring" ? "/hire/register" : workspace === "practice" ? "/practice/register" : "/register"
);
