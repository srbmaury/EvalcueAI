import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageView } from "../utils/analytics.js";

// Fires a GA page_view on every client-side route change. gtag's own automatic
// page_view (on initial script load) is disabled in initGoogleAnalytics so this
// is the single source of page views, covering the very first page too.
export default function AnalyticsPageViewTracker() {
    const { pathname } = useLocation();
    useEffect(() => { trackPageView(pathname); }, [pathname]);
    return null;
}
