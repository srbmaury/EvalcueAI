import axios from "axios";
import { PRACTICE_LIMIT_EVENT } from "../components/PracticeLimitDialog";

export const resolveApiBaseUrl = (envUrl, hostname) => {
    const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
    if (isLocal) {
        if (!envUrl || envUrl.startsWith("/")) return "/api";
        try {
            const configuredHost = new URL(envUrl).hostname;
            if (["localhost", "127.0.0.1", "::1"].includes(configuredHost)) return "/api";
        } catch { /* use the configured value below */ }
    }
    return envUrl || "/api";
};

const resolveBaseUrl = () => resolveApiBaseUrl(
    import.meta?.env?.VITE_API_BASE_URL,
    typeof window !== "undefined" ? window.location.hostname : "",
);

export const shouldAttachOrganization = (url = "") => {
    let pathname;
    try {
        pathname = new URL(url, "http://evalcue.local").pathname;
    } catch {
        return false;
    }

    // Axios requests are normally relative to /api, but normalize absolute /api URLs too.
    const path = pathname.replace(/^\/api(?=\/|$)/, "") || "/";
    const isAssessmentApi = path === "/assessments" || path.startsWith("/assessments/");
    const isCandidateApi = path === "/assessments/public" || path.startsWith("/assessments/public/");
    const isHiringBillingApi = path === "/billing/hiring" || path.startsWith("/billing/hiring/");
    const isProtectedSsoSettingsApi = path === "/sso/settings" || path.startsWith("/sso/settings/");

    return (isAssessmentApi && !isCandidateApi) || isHiringBillingApi || isProtectedSsoSettingsApi;
};

const api = axios.create({
    baseURL: resolveBaseUrl(),
    withCredentials: true,
});

let accessToken = null;
let organizationId = null;
export const setAccessToken = (token) => { accessToken = token || null; };
export const clearAccessToken = () => { accessToken = null; };
export const setOrganizationId = (id) => { organizationId = id || null; };

// Authentication is global; organization context is attached only to organization-scoped Hiring APIs.
api.interceptors.request.use((config) => {
    try {
        if (accessToken) config.headers["Authorization"] = `Bearer ${accessToken}`;
        if (organizationId && shouldAttachOrganization(config.url)) {
            config.headers["X-Organization-Id"] = organizationId;
        }
    } catch { /* ignore */ }
    return config;
});

let refreshPromise = null;

export const silentRefresh = async () => {
    if (!refreshPromise) {
        refreshPromise = axios
            .post(`${resolveBaseUrl()}/auth/refresh`, {}, { withCredentials: true })
            .then((res) => {
                const token = res?.data?.token;
                if (token) setAccessToken(token);
                return token;
            })
            .finally(() => { refreshPromise = null; });
    }
    return refreshPromise;
};

// On 401: try silent refresh once, then redirect to login.
// Product entitlement failures are surfaced consistently through one global UI.
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const status = error?.response?.status;
        const responseData = error?.response?.data;
        const originalConfig = error?.config;

        if (responseData?.code === "PRACTICE_LIMIT_REACHED") {
            try {
                window.dispatchEvent(new CustomEvent(PRACTICE_LIMIT_EVENT, { detail: responseData }));
            } catch { /* non-browser / test environments */ }
        }

        if (status === 401 && originalConfig && !originalConfig.__retried && !originalConfig.skipAuthRedirect) {
            originalConfig.__retried = true;
            try {
                const newToken = await silentRefresh();
                if (newToken) {
                    originalConfig.headers["Authorization"] = `Bearer ${newToken}`;
                    return api.request(originalConfig);
                }
            } catch { /* refresh failed — fall through to logout */ }

            try {
                clearAccessToken();
                if (!window.location.pathname.startsWith("/login")) {
                    window.location.href = "/login";
                }
            } catch { /* ignore */ }
        }

        return Promise.reject(error);
    }
);

export default api;