const ROOT_PATHS = new Set([
    "/",
    "/interview-practice",
    "/technical-hiring",
    "/login",
    "/register",
    "/verify-email",
    "/forgot-password",
    "/reset-password",
    "/privacy",
    "/terms",
    "/docs",
    "/sso/callback",
    "/practice/dashboard",
    "/practice/resume-review",
    "/practice/progress",
    "/practice/company-insights",
    "/practice/profile",
    "/practice/pricing",
    "/practice/billing/success",
    "/hire/billing/success",
    "/admin/feedback",
    "/admin/audit",
    "/hire/team",
    "/hire/sso",
]);

export const isGlobalNavigationRoot = ({ pathname, search = "" }) => {
    if (!pathname) return true;
    if (ROOT_PATHS.has(pathname)) return true;
    if (pathname.startsWith("/docs/")) return true;
    if (pathname.startsWith("/assessment/")) return true;

    // Hiring overview, candidate pipeline, and assessment list are sibling root views.
    // The builder is intentionally nested so /hire/assessments?create=1 keeps a Back action.
    if (pathname === "/hire/assessments") return !search;

    return false;
};

export const shouldShowGlobalBack = (location) => !isGlobalNavigationRoot(location);
