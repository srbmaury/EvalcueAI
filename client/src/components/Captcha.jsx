import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import usePublicConfig from "../hooks/usePublicConfig";

// Lightweight, dependency-free CAPTCHA wrapper for Turnstile or reCAPTCHA v2 checkbox.
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

const Captcha = ({ onVerify, onExpire, provider, theme = "auto", enabled = true }) => {
    const publicConfig = usePublicConfig();
    const containerRef = useRef(null);
    const widgetIdRef = useRef(null);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState("");
    const onVerifyRef = useRef(onVerify);
    const onExpireRef = useRef(onExpire);
    useEffect(() => { onVerifyRef.current = onVerify; }, [onVerify]);
    useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

    const cfg = useMemo(() => {
        const runtime = publicConfig?.captcha || {};
        const selectedProvider = String(provider || runtime.provider || "turnstile").toLowerCase() === "recaptcha" ? "recaptcha" : "turnstile";
        return {
            enabled: Boolean(enabled && runtime.enabled),
            provider: selectedProvider,
            siteKey: runtime.siteKey || "",
        };
    }, [enabled, provider, publicConfig]);

    const reset = useCallback(() => {
        try {
            if (cfg.provider === "turnstile" && window.turnstile && widgetIdRef.current != null) window.turnstile.reset(widgetIdRef.current);
            if (cfg.provider === "recaptcha" && window.grecaptcha && widgetIdRef.current != null) window.grecaptcha.reset(widgetIdRef.current);
        } catch { /* CAPTCHA reset is best-effort. */ }
    }, [cfg.provider]);

    useEffect(() => {
        if (!cfg.enabled) {
            setReady(false);
            setError("");
            return undefined;
        }
        let cancelled = false;
        const init = async () => {
            try {
                setError("");
                if (widgetIdRef.current != null) return;
                if (!cfg.siteKey) throw new Error("CAPTCHA is enabled but its public site key is not configured.");
                if (cfg.provider === "turnstile") {
                    await loadScript("https://challenges.cloudflare.com/turnstile/v0/api.js");
                    if (cancelled || !window.turnstile || !containerRef.current) return;
                    containerRef.current.innerHTML = "";
                    widgetIdRef.current = window.turnstile.render(containerRef.current, {
                        sitekey: cfg.siteKey,
                        theme,
                        callback: (token) => { try { onVerifyRef.current?.(token); } catch {} },
                        "expired-callback": () => { try { onExpireRef.current?.(); } catch {} },
                        "error-callback": () => setError("CAPTCHA failed to load. Try again."),
                    });
                    setReady(true);
                    return;
                }

                await loadScript("https://www.google.com/recaptcha/api.js?render=explicit");
                if (cancelled || !window.grecaptcha || !containerRef.current) return;
                window.grecaptcha.ready(() => {
                    if (cancelled || !containerRef.current) return;
                    try {
                        containerRef.current.innerHTML = "";
                        widgetIdRef.current = window.grecaptcha.render(containerRef.current, {
                            sitekey: cfg.siteKey,
                            theme: theme === "auto" ? "light" : theme,
                            callback: (token) => { try { onVerifyRef.current?.(token); } catch {} },
                            "expired-callback": () => { try { onExpireRef.current?.(); } catch {} },
                            "error-callback": () => setError("CAPTCHA failed to load. Try again."),
                        });
                        setReady(true);
                    } catch { setError("CAPTCHA failed to initialize."); }
                });
            } catch (caught) {
                setError(caught?.message || "CAPTCHA error");
            }
        };
        init();
        const container = containerRef.current;
        return () => {
            cancelled = true;
            try {
                if (cfg.provider === "turnstile" && window.turnstile && widgetIdRef.current != null) window.turnstile.remove(widgetIdRef.current);
                else if (cfg.provider === "recaptcha" && window.grecaptcha && widgetIdRef.current != null) window.grecaptcha.reset(widgetIdRef.current);
                if (container) container.innerHTML = "";
            } catch { /* cleanup is best-effort */ }
            widgetIdRef.current = null;
        };
    }, [cfg.enabled, cfg.provider, cfg.siteKey, theme]);

    if (!cfg.enabled) return null;
    return (
        <div style={{ display: "grid", justifyContent: "center" }}>
            <div ref={containerRef} data-ready={ready ? "1" : "0"} />
            {error ? <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 6 }}>{error}</div> : null}
            <input type="hidden" data-captcha-widget-id={widgetIdRef.current || ""} />
            <button type="button" style={{ display: "none" }} onClick={reset} aria-hidden="true" />
        </div>
    );
};

export default Captcha;
