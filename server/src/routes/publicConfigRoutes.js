import express from "express";

const router = express.Router();

const enabled = (name) => String(process.env[name] || "").toLowerCase() === "true";

router.get("/", (_req, res) => {
    const provider = String(process.env.CAPTCHA_PROVIDER || "turnstile").toLowerCase() === "recaptcha" ? "recaptcha" : "turnstile";
    const captchaEnabled = process.env.NODE_ENV === "production" && enabled("CAPTCHA_ENABLED");
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
    return res.json({
        google: {
            enabled: Boolean(process.env.GOOGLE_CLIENT_ID),
            clientId: process.env.GOOGLE_CLIENT_ID || "",
        },
        captcha: {
            enabled: captchaEnabled,
            provider,
            siteKey: captchaEnabled ? (process.env.CAPTCHA_SITE_KEY || "") : "",
            loginEnabled: captchaEnabled && enabled("CAPTCHA_LOGIN_ENABLED"),
            registerEnabled: captchaEnabled && enabled("CAPTCHA_REGISTER_ENABLED"),
            candidateStartEnabled: captchaEnabled,
        },
        features: {
            accountDataExport: enabled("ACCOUNT_DATA_EXPORT_ENABLED"),
            codeExecution: enabled("ENABLE_CODE_EXEC"),
            transcription: enabled("ENABLE_STT"),
        },
    });
});

export default router;
