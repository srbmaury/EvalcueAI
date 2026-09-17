import api from "../api/axios";

let gaLoaded = false;

// Skips sending real hits from localhost by default so dev/test traffic doesn't
// pollute production GA data; opt in per-machine with VITE_GA_LOCAL_ENABLED=true.
export const initGoogleAnalytics = () => {
    const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID || "";
    if (!measurementId || gaLoaded) return;
    if (import.meta.env.DEV && import.meta.env.VITE_GA_LOCAL_ENABLED !== "true") return;
    gaLoaded = true;

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    // Page views are sent explicitly on every route change (see AnalyticsPageViewTracker)
    // instead of gtag's automatic first-load page_view, since this is a client-routed SPA
    // and gtag alone would otherwise only ever see one page view per session.
    window.gtag("config", measurementId, { send_page_view: false });

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(script);
};

export const trackPageView = (path = window.location.pathname) => {
    if (typeof window.gtag === "function") window.gtag("event", "page_view", { page_path: path, page_location: window.location.href });
};

export const trackEvent = (event, path = window.location.pathname) => {
    Promise.resolve(api.post("/events", { event, path })).catch(() => {});
    if (typeof window.gtag === "function") window.gtag("event", event, { page_path: path });
};
