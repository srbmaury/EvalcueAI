import { useEffect, useState } from "react";
import api from "../api/axios";

const fallbackConfig = () => ({
    google: {
        enabled: Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID),
        clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || "",
    },
    captcha: {
        enabled: Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY || import.meta.env.VITE_RECAPTCHA_SITE_KEY),
        provider: String(import.meta.env.VITE_CAPTCHA_PROVIDER || "turnstile").toLowerCase() === "recaptcha" ? "recaptcha" : "turnstile",
        loginEnabled: true,
        registerEnabled: true,
        candidateStartEnabled: true,
    },
    features: {
        accountDataExport: String(import.meta.env.VITE_ACCOUNT_DATA_EXPORT_ENABLED || "false") === "true",
        codeExecution: false,
        transcription: false,
    },
});

let cachedConfig = null;
let inFlight = null;

export const loadPublicConfig = async () => {
    if (cachedConfig) return cachedConfig;
    if (!inFlight) {
        inFlight = api.get("/auth/public-config", { skipAuthRedirect: true })
            .then(({ data }) => {
                cachedConfig = data || fallbackConfig();
                return cachedConfig;
            })
            .catch(() => {
                cachedConfig = fallbackConfig();
                return cachedConfig;
            })
            .finally(() => { inFlight = null; });
    }
    return inFlight;
};

export default function usePublicConfig() {
    const [config, setConfig] = useState(cachedConfig || fallbackConfig());
    useEffect(() => {
        let cancelled = false;
        loadPublicConfig().then((value) => { if (!cancelled) setConfig(value); });
        return () => { cancelled = true; };
    }, []);
    return config;
}
