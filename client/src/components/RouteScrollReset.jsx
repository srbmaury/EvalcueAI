import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function RouteScrollReset() {
    const { pathname, hash } = useLocation();
    useEffect(() => {
        if (!hash) {
            window.scrollTo({ top: 0, left: 0, behavior: "instant" });
            return;
        }
        let id;
        try { id = decodeURIComponent(hash.slice(1)); } catch { return; }
        const scrollToAnchor = () => {
            const target = document.getElementById(id);
            if (!target) return false;
            target.scrollIntoView({ block: "start", behavior: "instant" });
            return true;
        };
        if (scrollToAnchor()) return;
        // Lazy route content may mount after the navigation effect.
        const observer = new MutationObserver(() => { if (scrollToAnchor()) observer.disconnect(); });
        observer.observe(document.getElementById("main-content") || document.body, { childList: true, subtree: true });
        const timeout = setTimeout(() => observer.disconnect(), 10000);
        return () => { observer.disconnect(); clearTimeout(timeout); };
    }, [pathname, hash]);
    return null;
}
