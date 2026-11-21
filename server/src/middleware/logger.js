import pino from "pino";
import pinoHttp from "pino-http";

const logger = pino({
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug"),
    redact: {
        paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            'res.headers["set-cookie"]',
            'req.headers["x-csrf-token"]',
            'req.headers["x-xsrf-token"]',
            'req.headers["x-captcha-token"]',
            "req.body.password",
            "req.body.newPassword",
            "req.body.captchaToken",
            "req.body.email",
            "req.body.name",
            "req.body.token",
            "req.body.startToken",
            'req.headers["x-attempt-token"]',
            "req.body.idToken",
        ],
        remove: true,
    },
});

const httpLogger = pinoHttp({
    logger,
    customProps: (req, res) => ({ requestId: req.id }),
    autoLogging: { ignore: (req) => req.url.startsWith("/health/") },
});

export default httpLogger;