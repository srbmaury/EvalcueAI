// Blocks cross-site state-changing requests that bypass CSRF.
// Verifies Origin/Referer matches allowed origins when present.


const sameOrigin = (value, allowed) => {
    try {
        const v = new URL(value);
        return allowed.some((o) => {
            try { const u = new URL(o); return u.origin === v.origin; } catch { return false; }
        });
    } catch { return false; }
};

import metrics from "../metrics/index.js";
import { normalizeRoute } from "../metrics/routes.js";
import { allowedOrigins } from "../config/clientOrigins.js";

const originCheck = () => (req, res, next) => {
    try {
        if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
        const enforce = process.env.NODE_ENV === "production" || process.env.ORIGIN_CHECK_ENFORCE === "true";
        if (!enforce) return next();
        const allowed = allowedOrigins();
        const origin = req.get("origin");
        const referer = req.get("referer");
        if (origin && sameOrigin(origin, allowed)) return next();
        if (referer && sameOrigin(referer, allowed)) return next();
        // Modern browsers always send Origin on state-changing cross-origin requests,
        // so a request with neither header is either a non-browser client hitting a
        // route it has no business calling, or a browser edge case worth blocking —
        // there is no separate CSRF-token layer to fall back on. Webhook routes are
        // mounted before this middleware and never reach this check.
        try { metrics.originDeniedTotal.labels(normalizeRoute(req)).inc(); } catch {}
        return res.status(403).json({ message: "Cross-origin request blocked" });
    } catch {
        try { metrics.originDeniedTotal.labels(normalizeRoute(req)).inc(); } catch {}
        return res.status(403).json({ message: "Cross-origin request blocked" });
    }
};

export default originCheck;
