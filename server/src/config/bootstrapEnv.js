import dotenv from "dotenv";

dotenv.config();

const CURRENT_STRIPE_PRICE_KEYS = [
    "STRIPE_PRACTICE_PRO_PRICE_ID",
    "STRIPE_HIRING_PILOT_PRICE_ID",
    "STRIPE_HIRING_STARTER_PRICE_ID",
    "STRIPE_HIRING_GROWTH_PRICE_ID",
];

export const normalizeEnvironment = (env = process.env) => {
    if (env.NODE_ENV === "production" && !env.COOKIE_SAMESITE) {
        env.COOKIE_SAMESITE = "none";
    }

    // Optional capabilities must default consistently everywhere. Routes only
    // enable these features for the literal value "true", so normalize missing
    // values to "false" before startup validation reads them as well.
    if (!env.ENABLE_STT) env.ENABLE_STT = "false";
    if (!env.ENABLE_CODE_EXEC) env.ENABLE_CODE_EXEC = "false";
    if (!env.ACCOUNT_DATA_EXPORT_ENABLED) env.ACCOUNT_DATA_EXPORT_ENABLED = "false";

    // Browser CAPTCHA configuration is public but still required when the
    // server enforces CAPTCHA. Fail before accepting traffic instead of serving
    // a UI that can never obtain a valid challenge token.
    if (env.NODE_ENV === "production" && env.CAPTCHA_ENABLED === "true" && !String(env.CAPTCHA_SITE_KEY || "").trim()) {
        throw new Error("CAPTCHA_SITE_KEY is required when CAPTCHA is enabled in production");
    }

    // Render Key Value exposes an unauthenticated internal Redis endpoint to
    // services in the same workspace/region. Allow deployments to provide the
    // host/port separately while preserving REDIS_URL as the canonical value
    // consumed by the rest of the application.
    if (!env.REDIS_URL && env.REDIS_HOST) {
        const host = String(env.REDIS_HOST).trim();
        const port = String(env.REDIS_PORT || "6379").trim() || "6379";
        if (host) env.REDIS_URL = `redis://${host}:${port}`;
    }

    // app.js historically exposed a Stripe readiness gauge through the old
    // STRIPE_PRO_PRICE_ID name. Keep that gauge accurate while the billing
    // product uses separate Practice and Hiring price IDs.
    if (!env.STRIPE_PRO_PRICE_ID && CURRENT_STRIPE_PRICE_KEYS.every((key) => Boolean(env[key]))) {
        env.STRIPE_PRO_PRICE_ID = env.STRIPE_PRACTICE_PRO_PRICE_ID;
    }

    return env;
};

normalizeEnvironment();
