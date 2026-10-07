import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
// csrf middleware removed
import { RedisStore } from "rate-limit-redis";
import getRedisClient from "./config/redis.js";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import metrics from "./metrics/index.js";
import { allowedOrigins as allowedOriginsFromEnv } from "./config/clientOrigins.js";
import requestId from "./middleware/requestId.js";
import errorHandler from "./middleware/errorHandler.js";
import httpLogger from "./middleware/logger.js";
import { normalizeRoute } from "./metrics/routes.js";
import originCheck from "./middleware/originCheck.js";

import swaggerSpec from "./config/swagger.js";

// API routes
import authRoutes from "./routes/authRoutes.js";
import feedbackRoutes from "./routes/feedbackRoutes.js";
import interviewRoutes from "./routes/interviewRoutes.js";
import questionRoutes from "./routes/questionRoutes.js";
import resumeRoutes from "./routes/resumeRoutes.js";
import roundRoutes from "./routes/roundRoutes.js";
import runCodeRoutes from "./routes/runCodeRoutes.js";
import { availableRuntimeIds } from "./services/codeRunner.js";
import sttRoutes from "./routes/sttRoutes.js";
import experienceRoutes from "./routes/experienceRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import jobsRoutes from "./routes/jobsRoutes.js";
import productFeedbackRoutes from "./routes/productFeedbackRoutes.js";
import billingRoutes from "./routes/billingRoutes.js";
import recommendationRoutes from "./routes/recommendationRoutes.js";
import payuRoutes from "./routes/payuRoutes.js";
import productEventRoutes from "./routes/productEventRoutes.js";
import assessmentRoutes from "./routes/assessmentRoutes.js";
import emailWebhookRoutes from "./routes/emailWebhookRoutes.js";
import jobPostRoutes from "./routes/jobPostRoutes.js";
import organizationRoutes from "./routes/organizationRoutes.js";
import ssoRoutes from "./routes/ssoRoutes.js";

const app = express();

// Middleware
app.set("trust proxy", 1); // required for secure cookies behind proxies
app.use("/api/billing/payu", payuRoutes);
app.use(express.json({ limit: "700kb" }));
app.use("/api/email-webhooks", emailWebhookRoutes);
app.use(cookieParser());

const allowedOrigins = allowedOriginsFromEnv();

const corsOptions =
    process.env.NODE_ENV === "production"
        ? {
              origin: (origin, callback) => {
                  if (!origin) return callback(null, true);
                  if (allowedOrigins.includes(origin)) return callback(null, true);
                  return callback(new Error("CORS blocked: origin not allowed"));
              },
              credentials: true,
              optionsSuccessStatus: 204,
              allowedHeaders: [
                  "Content-Type",
                  "Accept",
                  "Authorization",
                  "X-Requested-With",
                  "X-CSRF-Token",
                  "X-XSRF-Token",
                  "X-Captcha-Token",
                  "X-Attempt-Token",
                  "X-Organization-Id",
              ],
              exposedHeaders: ["X-CSRF-Token", "X-XSRF-Token", "X-Resume-Page-Count"],
              methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
          }
        : {
              origin: true, // reflect request origin in dev
              credentials: true,
              optionsSuccessStatus: 204,
              allowedHeaders: [
                  "Content-Type",
                  "Accept",
                  "Authorization",
                  "X-Requested-With",
                  "X-CSRF-Token",
                  "X-XSRF-Token",
                  "X-Captcha-Token",
                  "X-Attempt-Token",
                  "X-Organization-Id",
              ],
              exposedHeaders: ["X-CSRF-Token", "X-XSRF-Token", "X-Resume-Page-Count"],
              methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
          };

app.use(cors(corsOptions));

// Prevent caching of auth endpoints (tokens, sensitive responses)
app.use((req, res, next) => {
    try {
        if (req.path.startsWith("/api/auth") || req.path.startsWith("/api/sso") || req.path.startsWith("/api/assessments")) {
            res.setHeader("Cache-Control", "no-store");
        }
    } catch {}
    next();
});

// Enforce HTTPS in production (behind proxy)
if (process.env.NODE_ENV === "production") {
    app.use((req, res, next) => {
        const xfProto = req.get("x-forwarded-proto");
        const proto = xfProto || (req.secure ? "https" : "http");
        if (proto !== "https") {
            try {
                const host = req.get("host");
                const url = `https://${host}${req.originalUrl || "/"}`;
                return res.redirect(301, url);
            } catch {
                return res.status(400).json({ message: "HTTPS required" });
            }
        }
        return next();
    });
}

// Security: HTTP headers
app.use(
    helmet({
        crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
        crossOriginResourcePolicy: { policy: "cross-origin" },
        contentSecurityPolicy:
            process.env.NODE_ENV === "production"
                ? {
                      directives: (() => {
                          const parse = (name) =>
                              (process.env[name] || "")
                                  .split(",")
                                  .map((s) => s.trim())
                                  .filter(Boolean);
                          const connectExtras = parse("CSP_CONNECT_SRC");
                          const imgExtras = parse("CSP_IMG_SRC");
                          const scriptExtras = parse("CSP_SCRIPT_SRC");
                          const styleExtras = parse("CSP_STYLE_SRC");
                          return {
                              defaultSrc: ["'self'"],
                              connectSrc: ["'self'", ...connectExtras],
                              frameAncestors: ["'none'"],
                              baseUri: ["'self'"],
                              formAction: ["'self'"],
                              imgSrc: ["'self'", "data:", "blob:", ...imgExtras],
                              scriptSrc: ["'self'", ...scriptExtras],
                              styleSrc: ["'self'", ...styleExtras],
                              fontSrc: ["'self'", "data:"],
                              objectSrc: ["'none'"],
                          };
                      })(),
                  }
                : false,
        referrerPolicy: { policy: "no-referrer" },
        hsts: process.env.NODE_ENV === "production" ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
        permissionsPolicy: {
            features: {
                geolocation: ["none"],
                microphone: ["none"],
                camera: ["none"],
                payment: ["none"],
                usb: ["none"],
                fullscreen: ["self"],
            },
        },
    })
);

// Request ID for tracing
app.use(requestId());
// Structured logging
app.use(httpLogger);

// Instrument requests before routes so completed API requests are observed.
app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();
    let finished = false;
    metrics.httpRequestsInFlight.labels(req.method).inc();
    res.on("finish", () => {
        finished = true;
        try {
            const route = normalizeRoute(req);
            const status = String(res.statusCode);
            const elapsed = Number(process.hrtime.bigint() - startedAt) / 1e9;
            metrics.httpRequestsTotal.labels(req.method, route, String(res.statusCode)).inc();
            metrics.httpRequestDurationSeconds.labels(req.method, route, status).observe(elapsed);
            const bytes = Number(res.getHeader("content-length"));
            if (Number.isFinite(bytes)) metrics.httpResponseSizeBytes.labels(req.method, route, status).observe(bytes);
            metrics.httpRequestsInFlight.labels(req.method).dec();
        } catch {}
    });
    res.on("close", () => {
        if (finished) return;
        try {
            const route = normalizeRoute(req);
            metrics.httpRequestTimeoutsTotal.labels(req.method, route).inc();
            metrics.httpRequestsInFlight.labels(req.method).dec();
        } catch {}
    });
    next();
});

// Origin/Referer check for state-changing requests (defense-in-depth)
app.use(originCheck());

// The API host is a service endpoint, not a public website: keep every response out of search
// indexes so crawler hits (including transient 5xx during deploys) never surface as site pages.
app.use((req, res, next) => {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    next();
});

// Basic rate limiting for API (use Redis store in production)
const redisClient = process.env.NODE_ENV === "production" ? await getRedisClient() : null;

const makeStore = () =>
    process.env.NODE_ENV === "production" && redisClient
        ? new RedisStore({ sendCommand: (...args) => redisClient.sendCommand(args) })
        : undefined;

const makeLimiter = (windowMs, max, prefix = "rl") =>
    rateLimit({
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        store: makeStore(),
        keyGenerator: (req) => {
            let userId = req.user?.id || req.user?._id;
            if (!userId) {
                const authHeader = req.get("authorization") || "";
                if (/^bearer\s+/i.test(authHeader) && process.env.JWT_SECRET) {
                    try {
                        userId = jwt.verify(authHeader.slice(7).trim(), process.env.JWT_SECRET)?.id;
                    } catch { /* Invalid tokens remain IP-limited and are rejected by route auth. */ }
                }
            }
            return userId ? `${prefix}:user:${userId}` : `${prefix}:ip:${req.ip}`;
        },
        handler: (req, res) => {
            try { metrics.rateLimitHitsTotal.labels(normalizeRoute(req)).inc(); } catch {}
            res.status(429).json({ message: "Too many requests, please slow down." });
        },
    });

const apiLimiter = makeLimiter(
    Math.max(parseInt(process.env.API_RATE_LIMIT_WINDOW_MS || "900000", 10) || 900000, 1000),
    Math.max(parseInt(process.env.API_RATE_LIMIT_MAX || "300", 10) || 300, 1),
    "api"
);
// Tighter limits for AI-intensive endpoints (per authenticated user)
const aiLimiter   = makeLimiter(15 * 60 * 1000, parseInt(process.env.AI_RATE_LIMIT_MAX   || "30",  10) || 30,  "ai");
const sttLimiter  = makeLimiter(15 * 60 * 1000, parseInt(process.env.STT_RATE_LIMIT_MAX  || "60",  10) || 60,  "stt");
const codeLimiter = makeLimiter(15 * 60 * 1000, parseInt(process.env.CODE_RATE_LIMIT_MAX || "20",  10) || 20,  "code");

app.use("/api", apiLimiter);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/resumes", resumeRoutes);
app.use("/api/interviews", interviewRoutes);
app.use("/api/rounds", aiLimiter, roundRoutes);
app.use("/api/questions", aiLimiter, questionRoutes);
app.use("/api/feedback", aiLimiter, feedbackRoutes);
app.use("/api/run-code", codeLimiter, runCodeRoutes);
app.use("/api/stt", sttLimiter, sttRoutes);
app.use("/api/experiences", experienceRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/jobs", jobsRoutes);
app.use("/api/job-posts", jobPostRoutes);
app.use("/api/product-feedback", productFeedbackRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/recommendations", recommendationRoutes);
app.use("/api/events", productEventRoutes);
app.use("/api/organizations", organizationRoutes);
app.use("/api/sso", ssoRoutes);
app.use("/api/assessments", assessmentRoutes);

// The API host is a service endpoint, not a public website. Send requests for its root
// to the canonical marketing site instead of leaving a bare host URL unresolved.
app.get("/", (req, res) => {
    const landingOrigin = String(process.env.LANDING_ORIGIN || "https://evalcueai.com").trim().replace(/\/+$/, "");
    res.redirect(301, `${landingOrigin}/`);
});

// Health endpoints
app.get("/health/liveness", (req, res) => {
    res.json({ status: "ok", uptime: process.uptime(), timestamp: Date.now() });
});

app.get("/health/readiness", async (req, res) => {
    const mongoReady = mongoose.connection?.readyState === 1;
    let redisStatus = "disabled";
    try {
        if (process.env.REDIS_URL) {
            const redisStartedAt = process.hrtime.bigint();
            const client = await getRedisClient();
            if (client && client.isOpen) {
                try {
                    const pong = await Promise.race([
                        client.ping(),
                        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 500)),
                    ]);
                    redisStatus = pong === "PONG" ? "up" : "unknown";
                    metrics.dependencyOperationDurationSeconds.labels("redis", "ping", redisStatus === "up" ? "success" : "failure").observe(Number(process.hrtime.bigint() - redisStartedAt) / 1e9);
                } catch (e) {
                    redisStatus = "down";
                    metrics.dependencyOperationDurationSeconds.labels("redis", "ping", "failure").observe(Number(process.hrtime.bigint() - redisStartedAt) / 1e9);
                }
            } else {
                redisStatus = "down";
            }
        }
    } catch {
        redisStatus = "down";
    }

    metrics.componentReady.labels("mongo").set(mongoReady ? 1 : 0);
    metrics.componentReady.labels("redis").set(redisStatus === "up" || redisStatus === "disabled" ? 1 : 0);
    metrics.componentReady.labels("email").set(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL || process.env.NODE_ENV === "test" ? 1 : 0);
    metrics.componentReady.labels("payu").set(process.env.PAYU_MERCHANT_KEY && process.env.PAYU_MERCHANT_SALT && process.env.PAYU_ZION_ENABLED === "true" ? 1 : 0);
    // The code runner is reported but does not fail readiness: an outage disables code execution, not the API.
    const codeRunner = process.env.ENABLE_CODE_EXEC === "true" ? ((await availableRuntimeIds()).length ? "up" : "down") : "disabled";
    const allOk = mongoReady && (redisStatus === "up" || redisStatus === "disabled");
    const statusCode = allOk ? 200 : 503;
    return res.status(statusCode).json({
        status: allOk ? "ok" : "degraded",
        components: {
            mongo: mongoReady ? "up" : "down",
            redis: redisStatus,
            codeRunner,
        },
        timestamp: Date.now(),
    });
});

// Prometheus metrics collection
const metricsToken = process.env.METRICS_TOKEN || "";
app.get("/metrics", async (req, res) => {
    try {
        if (metricsToken) {
            const token = req.get("x-metrics-token");
            if (token !== metricsToken) return res.status(401).send("unauthorized\n");
        }
        res.setHeader("Content-Type", "text/plain; version=0.0.4");
        return res.send(await metrics.client.register.metrics());
    } catch (e) {
        return res.status(500).send("app_up 0\n");
    }
});

// Swagger docs (disabled in production)
if (process.env.NODE_ENV !== "production") {
    app.use(
        "/api-docs",
        swaggerUi.serve,
        swaggerUi.setup(swaggerSpec, {
            explorer: true,
            swaggerOptions: {
                persistAuthorization: true,
                requestInterceptor: (req) => {
                    req.credentials = "include";
                    return req;
                },
            },
        })
    );
}

// Serve raw OpenAPI JSON (disabled in production)
if (process.env.NODE_ENV !== "production") {
    app.get("/api-docs.json", (req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.send(swaggerSpec);
    });
}

// 404 fallback
app.use((req, res, next) => {
    res.status(404).json({ message: "Route not found" });
});

// Global error handler
app.use(errorHandler);

export default app;
