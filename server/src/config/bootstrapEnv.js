import dotenv from "dotenv";

// Tests configure their own environment (src/test/setupEnv.js) and must not pick up a developer's .env:
// it points at real Redis, AI providers, email and PayU, and makes local runs differ from CI.
if (process.env.NODE_ENV !== "test") dotenv.config();

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

    // Render Key Value exposes an unauthenticated internal Redis endpoint to
    // services in the same workspace/region. Allow deployments to provide the
    // host/port separately while preserving REDIS_URL as the canonical value
    // consumed by the rest of the application.
    if (!env.REDIS_URL && env.REDIS_HOST) {
        const host = String(env.REDIS_HOST).trim();
        const port = String(env.REDIS_PORT || "6379").trim() || "6379";
        if (host) env.REDIS_URL = `redis://${host}:${port}`;
    }

    return env;
};

normalizeEnvironment();
