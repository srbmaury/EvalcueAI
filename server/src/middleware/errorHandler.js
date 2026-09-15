import metrics from "../metrics/index.js";
import { normalizeRoute } from "../metrics/routes.js";

// Central error handler - keeps responses uniform and redacts sensitive data
// eslint-disable-next-line no-unused-vars
const MULTER_ERROR_MESSAGES = {
    LIMIT_FILE_SIZE: "File is too large.",
    LIMIT_FILE_COUNT: "Too many files.",
    LIMIT_UNEXPECTED_FILE: "Too many files.",
};

const errorHandler = (err, req, res, next) => {
    if (err.name === "MulterError") {
        return res.status(400).json({ message: MULTER_ERROR_MESSAGES[err.code] || "The uploaded file could not be processed.", requestId: req.id || undefined });
    }
    const status = err.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500;
    const requestId = req.id || undefined;
    const payload = {
        message: status === 500 ? "Internal server error" : err.message || "Error",
        requestId,
    };
    if (process.env.NODE_ENV !== "production") {
        payload.stack = err.stack;
    }
    // Log server-side with minimal PII
    try {
        console.error(JSON.stringify({ level: "error", requestId, status, message: err.message, stack: err.stack }));
        try { metrics.errorsTotal.labels(String(status), normalizeRoute(req)).inc(); } catch {}
    } catch {}
    // Optional: Sentry or other error tracking
    try {
        if (process.env.SENTRY_DSN && global.Sentry && typeof global.Sentry.captureException === "function") {
            global.Sentry.captureException(err, { tags: { requestId } });
        }
    } catch {}
    res.status(status).json(payload);
};

export default errorHandler;
