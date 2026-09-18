import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useThemeMode } from "../context/ThemeContext";
import usePublicConfig from "../hooks/usePublicConfig";

// Lightweight, dependency-free CAPTCHA wrapper for Turnstile or reCAPTCHA v2 checkbox.
// Props:
// - onVerify(token: string)
// - onExpire?()
// - provider?: "turnstile" | "recaptcha" (defaults to the server-configured provider)
// - theme?: "auto" | "light" | "dark"
// - enabled?: whether this specific flow (login/register/candidate start) requires CAPTCHA,
//   on top of the server's overall CAPTCHA_ENABLED flag (see usePublicConfig)
const loadScript = (src) => new Promise((resolve, reject) => {
    try {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
            if (existing.getAttribute("data-loaded") === "true") return resolve();
            existing.addEventListener("load", () => resolve(), { once: true });
            existing.addEventListener("error", (event) => reject(event), { once: true });
            return;
        }
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.defer = true;
        script.addEventListener("load", () => {
            script.setAttribute("data-loaded", "true");
            resolve();
        }, { once: true });
        script.addEventListener("error", (event) => reject(event), { once: true });
        document.head.appendChild(script);
    } catch (error) { reject(error); }
});

const Captcha = forwardRef(function Captcha({ onVerify, onExpire, provider, theme = "auto", enabled = true }, ref) {
    const containerRef = useRef(null);
    const widgetIdRef = useRef(null);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState("");
    const { mode: appThemeMode } = useThemeMode();
    const resolvedTheme = theme === "auto" ? appThemeMode : theme;
    const publicConfig = usePublicConfig();

    // Keep latest callbacks without retriggering init.
    const onVerifyRef = useRef(onVerify);
    const onExpireRef = useRef(onExpire);
    useEffect(() => { onVerifyRef.current = onVerify; }, [onVerify]);
    useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

    const cfg = useMemo(() => {
        const runtime = publicConfig?.captcha || {};
        const selectedProvider = String(provider || runtime.provider || "turnstile").toLowerCase() === "recaptcha" ? "recaptcha" : "turnstile";
        // The site key is public but baked in at client build time (not served by the
        // backend): rotating it only needs a client rebuild, and it removes a server env
        // var whose absence would otherwise be a hard production-boot failure.
        const siteKey = selectedProvider === "recaptcha" ? import.meta.env.VITE_RECAPTCHA_SITE_KEY : import.meta.env.VITE_TURNSTILE_SITE_KEY;
        return {
            enabled: Boolean(enabled && runtime.enabled),
            provider: selectedProvider,
            siteKey: siteKey || "",
        };
    }, [enabled, provider, publicConfig]);

    // Local Vite dev skips mounting a real CAPTCHA unless explicitly opted in.
    // Production builds are unaffected: import.meta.env.DEV is false there.
    const skipLocally = import.meta.env.DEV && import.meta.env.VITE_CAPTCHA_LOCAL_ENABLED !== "true";

    const clearVerification = useCallback(() => {
        try { onExpireRef.current?.(); } catch { /* Consumer callback errors must not break the widget. */ }
    }, []);

    const reset = useCallback(() => {
        try {
            if (cfg.provider === "turnstile" && window.turnstile && widgetIdRef.current != null) window.turnstile.reset(widgetIdRef.current);
            if (cfg.provider === "recaptcha" && window.grecaptcha && widgetIdRef.current != null) window.grecaptcha.reset(widgetIdRef.current);
        } catch { /* CAPTCHA reset is best-effort. */ }
        clearVerification();
        setError("");
    }, [cfg.provider, clearVerification]);

    useImperativeHandle(ref, () => ({ reset }), [reset]);

    useEffect(() => {
        if (skipLocally || !cfg.enabled) {
            setReady(false);
            setError("");
            return undefined;
        }
        let cancelled = false;
        const init = async () => {
            try {
                setReady(false);
                setError("");
                if (widgetIdRef.current != null) return;
                if (!cfg.siteKey) throw new Error("CAPTCHA is enabled but its public site key is not configured.");
                if (cfg.provider === "turnstile") {
                    if (!window.turnstile) await loadScript("https://challenges.cloudflare.com/turnstile/v0/api.js");
                    if (cancelled || !window.turnstile || !containerRef.current) return;
                    containerRef.current.innerHTML = "";
                    widgetIdRef.current = window.turnstile.render(containerRef.current, {
                        sitekey: cfg.siteKey,
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
                    setReady(true);
                    return;
                }

                if (!window.grecaptcha) await loadScript("https://www.google.com/recaptcha/api.js?render=explicit");
                if (cancelled || !window.grecaptcha || !containerRef.current) return;
                window.grecaptcha.ready(() => {
                    if (cancelled || !containerRef.current) return;
                    try {
                        containerRef.current.innerHTML = "";
                        widgetIdRef.current = window.grecaptcha.render(containerRef.current, {
                            sitekey: cfg.siteKey,
                            theme: resolvedTheme === "auto" ? "light" : resolvedTheme,
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
                        setReady(true);
                    } catch {
                        clearVerification();
                        setError("CAPTCHA failed to initialize.");
                    }
                });
            } catch (caught) {
                clearVerification();
                setError(caught?.message || "CAPTCHA error");
            }
        };
        init();
        return () => {
            cancelled = true;
            const widgetId = widgetIdRef.current;
            const container = containerRef.current;
            try {
                if (cfg.provider === "turnstile" && window.turnstile && widgetId != null) {
                    window.turnstile.remove(widgetId);
                } else if (cfg.provider === "recaptcha" && window.grecaptcha && widgetId != null) {
                    try { window.grecaptcha.reset(widgetId); } catch { /* Widget may already be removed. */ }
                }
                if (container) container.innerHTML = "";
            } catch { /* Cleanup is best-effort. */ }
            widgetIdRef.current = null;
        };
    }, [cfg.enabled, cfg.provider, cfg.siteKey, resolvedTheme, clearVerification, skipLocally]);

    if (skipLocally || !cfg.enabled) return null;
    return (
        <div style={{ display: "grid", justifyContent: "center" }}>
            <div ref={containerRef} data-ready={ready ? "1" : "0"} />
            {error ? <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 6 }}>{error}</div> : null}
            <input type="hidden" data-captcha-widget-id={widgetIdRef.current ?? ""} />
        </div>
    );
});

export default Captcha;
