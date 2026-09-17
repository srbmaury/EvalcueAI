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
    window.gtag("config", measurementId);

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(script);
};

export const trackEvent = (event, path = window.location.pathname) => {
    Promise.resolve(api.post("/events", { event, path })).catch(() => {});
    if (typeof window.gtag === "function") window.gtag("event", event, { page_path: path });
};
