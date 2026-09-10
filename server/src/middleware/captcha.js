import fetch from "node-fetch";

const fetchWithTimeout = async (url, options) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try { return await fetch(url, { ...options, signal: controller.signal }); }
    finally { clearTimeout(timeout); }
};

const normalizeVerification = (data, httpStatus = 200) => ({
    success: Boolean(data?.success),
    errorCodes: Array.isArray(data?.["error-codes"]) ? data["error-codes"].map(String) : [],
    hostname: typeof data?.hostname === "string" ? data.hostname : null,
    action: typeof data?.action === "string" ? data.action : null,
    httpStatus,
});

const verifyTurnstile = async (token, ip) => {
    const secret = process.env.CAPTCHA_SECRET;
    if (!secret) return { success: false, errorCodes: ["missing-secret"], hostname: null, action: null, httpStatus: 0 };
    const resp = await fetchWithTimeout("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token, remoteip: ip || "" }),
    });
    if (!resp.ok) return { success: false, errorCodes: [`verification-http-${resp.status}`], hostname: null, action: null, httpStatus: resp.status };
    return normalizeVerification(await resp.json(), resp.status);
};

const verifyRecaptcha = async (token, ip) => {
    const secret = process.env.CAPTCHA_SECRET;
    if (!secret) return { success: false, errorCodes: ["missing-secret"], hostname: null, action: null, httpStatus: 0 };
    const resp = await fetchWithTimeout("https://www.google.com/recaptcha/api/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token, remoteip: ip || "" }),
    });
    if (!resp.ok) return { success: false, errorCodes: [`verification-http-${resp.status}`], hostname: null, action: null, httpStatus: resp.status };
    return normalizeVerification(await resp.json(), resp.status);
};

const captcha = () => {
    return async (req, res, next) => {
        const provider = (process.env.CAPTCHA_PROVIDER || "turnstile").toLowerCase();
        try {
            if (process.env.NODE_ENV !== "production") return next();
            if (process.env.CAPTCHA_ENABLED !== "true") return next();
            const token = req.body?.captchaToken || req.get("x-captcha-token");
            if (!token) return res.status(400).json({ message: "Complete the CAPTCHA verification and try again.", code: "CAPTCHA_REQUIRED" });

            const ip = req.ip;
            let result;
            if (provider === "turnstile") result = await verifyTurnstile(token, ip);
            else if (provider === "recaptcha") result = await verifyRecaptcha(token, ip);
            else result = { success: false, errorCodes: ["unsupported-provider"], hostname: null, action: null, httpStatus: 0 };

            if (!result.success) {
                req.log?.warn({
                    captchaProvider: provider,
                    captchaErrorCodes: result.errorCodes,
                    captchaHostname: result.hostname,
                    captchaAction: result.action,
                    captchaVerificationStatus: result.httpStatus,
                }, "CAPTCHA verification failed");

                const retryRequired = result.errorCodes.includes("timeout-or-duplicate");
                return res.status(400).json({
                    message: retryRequired ? "CAPTCHA expired. Please verify again." : "CAPTCHA verification failed. Please verify again.",
                    code: retryRequired ? "CAPTCHA_RETRY_REQUIRED" : "CAPTCHA_VERIFICATION_FAILED",
                });
            }
            return next();
        } catch (error) {
            req.log?.warn({ captchaProvider: provider, captchaError: error?.message || "unknown" }, "CAPTCHA verification error");
            return res.status(400).json({ message: "CAPTCHA verification error. Please verify again.", code: "CAPTCHA_VERIFICATION_ERROR" });
        }
    };
};

export default captcha;
