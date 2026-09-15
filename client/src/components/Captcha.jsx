import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useThemeMode } from "../context/ThemeContext";

// Lightweight, dependency-free CAPTCHA wrapper for Turnstile or reCAPTCHA v2 checkbox
// Props:
// - onVerify(token: string)
// - onExpire?()
// - provider?: "turnstile" | "recaptcha" (defaults from env)
// - theme?: "auto" | "light" | "dark"

const loadScript = (src) =>
    new Promise((resolve, reject) => {
        try {
            const existing = document.querySelector(`script[src="${src}"]`);
            if (existing) {
                if (existing.getAttribute("data-loaded") === "true") return resolve();
                existing.addEventListener("load", () => resolve(), { once: true });
                existing.addEventListener("error", (e) => reject(e), { once: true });
                return;
            }
            const s = document.createElement("script");
            s.src = src;
            s.async = true;
            s.defer = true;
            s.addEventListener("load", () => {
                s.setAttribute("data-loaded", "true");
                resolve();
            }, { once: true });
            s.addEventListener("error", (e) => reject(e), { once: true });
            document.head.appendChild(s);
        } catch (e) {
            reject(e);
        }
    });

const Captcha = forwardRef(function Captcha({ onVerify, onExpire, provider, theme = "auto" }, ref) {
    const containerRef = useRef(null);
    const widgetIdRef = useRef(null);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState("");
    const { mode: appThemeMode } = useThemeMode();
    const resolvedTheme = theme === "auto" ? appThemeMode : theme;

    // Keep latest callbacks without retriggering init.
    const onVerifyRef = useRef(onVerify);
    const onExpireRef = useRef(onExpire);
    useEffect(() => { onVerifyRef.current = onVerify; }, [onVerify]);
    useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

    const cfg = useMemo(() => {
        const p = (provider || (import.meta.env.VITE_CAPTCHA_PROVIDER || "turnstile")).toLowerCase();
        return {
            provider: p === "recaptcha" ? "recaptcha" : "turnstile",
            turnstileSiteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY || "",
            recaptchaSiteKey: import.meta.env.VITE_RECAPTCHA_SITE_KEY || "",
        };
    }, [provider]);

    // Local Vite dev skips mounting a real CAPTCHA unless explicitly opted in.
    // Production builds are unaffected: import.meta.env.DEV is false there.
    const skipLocally = import.meta.env.DEV && import.meta.env.VITE_CAPTCHA_LOCAL_ENABLED !== "true";

    const clearVerification = useCallback(() => {
        try { onExpireRef.current?.(); } catch { /* Consumer callback errors must not break the widget. */ }
    }, []);

    const reset = useCallback(() => {
        try {
            if (cfg.provider === "turnstile" && window.turnstile && widgetIdRef.current !== null) {
                window.turnstile.reset(widgetIdRef.current);
            }
            if (cfg.provider === "recaptcha" && window.grecaptcha && widgetIdRef.current !== null) {
                window.grecaptcha.reset(widgetIdRef.current);
            }
        } catch { /* CAPTCHA reset is best-effort. */ }
        clearVerification();
        setError("");
    }, [cfg.provider, clearVerification]);

    useImperativeHandle(ref, () => ({ reset }), [reset]);

    useEffect(() => {
        if (skipLocally) return undefined;
        let cancelled = false;
        const init = async () => {
            try {
                setReady(false);
                setError("");
                if (widgetIdRef.current !== null) return;
                if (cfg.provider === "turnstile") {
                    if (!cfg.turnstileSiteKey) throw new Error("Missing VITE_TURNSTILE_SITE_KEY");
                    if (!window.turnstile) await loadScript("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit");
                    if (cancelled) return;
                    if (!window.turnstile || !containerRef.current) throw new Error("CAPTCHA failed to initialize.");
                    containerRef.current.innerHTML = "";
                    const id = window.turnstile.render(containerRef.current, {
                        sitekey: cfg.turnstileSiteKey,
                        theme: resolvedTheme,
                        callback: (token) => {
                            setError("");
                            try { onVerifyRef.current?.(token); } catch { /* Consumer callback errors must not break the widget. */ }
                        },
                        "expired-callback": clearVerification,
                        "timeout-callback": clearVerification,
                        "error-callback": () => {
                            clearVerification();
                            setError("CAPTCHA failed to load. Try again.");
                        },
                    });
                    widgetIdRef.current = id;
                    setReady(true);
                    return;
                }

                if (!cfg.recaptchaSiteKey) throw new Error("Missing VITE_RECAPTCHA_SITE_KEY");
                if (!window.grecaptcha) await loadScript("https://www.google.com/recaptcha/api.js?render=explicit");
                if (cancelled) return;
                if (!window.grecaptcha || !containerRef.current) throw new Error("CAPTCHA failed to initialize.");
                window.grecaptcha.ready(() => {
                    if (cancelled || !containerRef.current) return;
                    try {
                        containerRef.current.innerHTML = "";
                        const id = window.grecaptcha.render(containerRef.current, {
                            sitekey: cfg.recaptchaSiteKey,
                            theme: resolvedTheme,
                            callback: (token) => {
                                setError("");
                                try { onVerifyRef.current?.(token); } catch { /* Consumer callback errors must not break the widget. */ }
                            },
                            "expired-callback": clearVerification,
                            "error-callback": () => {
                                clearVerification();
                                setError("CAPTCHA failed to load. Try again.");
                            },
                        });
                        widgetIdRef.current = id;
                        setReady(true);
                    } catch {
                        clearVerification();
                        setError("CAPTCHA failed to initialize.");
                    }
                });
            } catch (e) {
                clearVerification();
                setError(e?.message || "CAPTCHA error");
            }
        };
        init();
        return () => {
            cancelled = true;
            const widgetId = widgetIdRef.current;
            try {
                if (cfg.provider === "turnstile" && window.turnstile && widgetId !== null) {
                    window.turnstile.remove(widgetId);
                } else if (cfg.provider === "recaptcha" && window.grecaptcha && widgetId !== null) {
                    try { window.grecaptcha.reset(widgetId); } catch { /* Widget may already be removed. */ }
                    if (containerRef.current) containerRef.current.innerHTML = "";
                }
            } catch { /* Cleanup is best-effort. */ }
            widgetIdRef.current = null;
        };
    }, [cfg.provider, cfg.turnstileSiteKey, cfg.recaptchaSiteKey, resolvedTheme, clearVerification, skipLocally]);

    if (skipLocally) return null;

    return (
        <div style={{ display: "grid", justifyContent: "center" }}>
            <div ref={containerRef} data-ready={ready ? "1" : "0"} />
            {error ? (
                <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 6 }}>{error}</div>
            ) : null}
            <input type="hidden" data-captcha-widget-id={widgetIdRef.current ?? ""} />
        </div>
    );
});

export default Captcha;
