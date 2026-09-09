import "./config/bootstrapEnv.js";
import connectDB from "./config/db.js";
import app from "./app.js";
import { verifyEmailProvider } from "./utils/mailer.js";
import cron from "node-cron";
import cloudinary from "./config/cloudinaryConfig.js";
import Resume from "./models/Resume.js";
import { createWorker, getQueue, closeQueues } from "./queues/index.js";
import prepareQuestionsProcessor from "./queues/workers/prepareQuestions.js";
import bulkFeedbackProcessor from "./queues/workers/bulkFeedback.js";
import candidateAssessmentProcessor from "./queues/workers/candidateAssessment.js";
import { z } from "zod";
import mongoose from "mongoose";
import getRedisClient from "./config/redis.js";
import * as Sentry from "@sentry/node";
import { startOtlpPush } from "./metrics/otlpPush.js";
import { deliverDuePracticeReminders } from "./services/practiceReminders.js";
import CandidateAttempt from "./models/CandidateAttempt.js";
import Assessment from "./models/Assessment.js";
import { createJobId } from "./queues/jobIds.js";
import { processAssessmentLifecycle } from "./services/assessmentLifecycle.js";

try {
    if (process.env.SENTRY_DSN) {
        Sentry.init({
            dsn: process.env.SENTRY_DSN,
            environment: process.env.NODE_ENV || "development",
            tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
        });
        global.Sentry = Sentry;
        console.log("Sentry initialized");
    }
} catch (e) {
    console.warn("Sentry init failed:", e?.message || e);
}

try {
    if (process.env.NODE_ENV === "production") {
        if (!process.env.REDIS_URL) {
            console.error("REDIS_URL is required in production for session and rate limit management.");
            process.exit(1);
        }
        if (!process.env.METRICS_TOKEN) {
            console.error("METRICS_TOKEN is required in production to protect /metrics endpoint.");
            process.exit(1);
        }
        if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL || !process.env.BREVO_WEBHOOK_SECRET) {
            console.error("BREVO_API_KEY, BREVO_SENDER_EMAIL, and BREVO_WEBHOOK_SECRET are required in production for transactional email and delivery tracking.");
            process.exit(1);
        }
        if (process.env.CAPTCHA_ENABLED !== "true" || !process.env.CAPTCHA_SECRET || process.env.CAPTCHA_LOGIN_ENABLED !== "true" || process.env.CAPTCHA_REGISTER_ENABLED !== "true") {
            console.error("CAPTCHA must protect login and registration in production: enable CAPTCHA and both auth gates, then set CAPTCHA_SECRET.");
            process.exit(1);
        }
        if ((process.env.ENABLE_STT || "true").toLowerCase() === "true" && !process.env.OPENAI_API_KEY) {
            console.error("OPENAI_API_KEY is required when STT is enabled in production.");
            process.exit(1);
        }
        if ((process.env.ENABLE_CODE_EXEC || "true").toLowerCase() === "true" && !process.env.JUDGE0_URL) {
            console.error("JUDGE0_URL is required when code execution is enabled in production.");
            process.exit(1);
        }
        if (process.env.JUDGE0_URL) {
            try {
                const u = new URL(process.env.JUDGE0_URL);
                const allowedHosts = (process.env.ALLOWED_JUDGE0_HOSTS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
                if (allowedHosts.length > 0 && !allowedHosts.includes(u.hostname.toLowerCase())) {
                    console.error("JUDGE0_URL host not in ALLOWED_JUDGE0_HOSTS allowlist:", u.hostname);
                    process.exit(1);
                }
            } catch (e) {
                console.error("Invalid JUDGE0_URL:", e?.message || e);
                process.exit(1);
            }
        }
    }
} catch {}

const EnvSchema = z.object({
    NODE_ENV: z.string().optional(),
    PORT: z.string().optional(),
    JWT_SECRET: z.string().min(10, "JWT_SECRET must be at least 10 characters"),
    MONGO_URI: z.string().min(1, "MONGO_URI is required"),
    ALLOWED_ORIGINS: z.string().optional(),
    CLIENT_ORIGIN: z.string().optional(),
    PRACTICE_CLIENT_ORIGIN: z.string().optional(),
    HIRING_CLIENT_ORIGIN: z.string().optional(),
    SERVER_ORIGIN: z.string().optional(),
});
try {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
        const issues = parsed.error.errors.map((e) => `  ${e.path.join(".")}: ${e.message}`).join("\n");
        console.error(`[startup] Missing or invalid environment variables:\n${issues}`);
        process.exit(1);
    }
    if (!process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY) {
        console.warn("[startup] Neither OPENAI_API_KEY nor GEMINI_API_KEY is set — AI features will fail.");
    }
} catch {}
await connectDB();

const scheduledTasks = [];
const scheduleTask = (...args) => {
    const task = cron.schedule(...args);
    scheduledTasks.push(task);
    return task;
};
let stopOtlpPush = () => {};

const candidateEvaluationJobOptions = (attempt) => ({
    jobId: createJobId("candidate-assessment", { attemptId: String(attempt._id), evaluationStartedAt: attempt.evaluationStartedAt.toISOString() }),
    removeOnComplete: { age: 86400, count: 1000 },
    removeOnFail: { age: 604800, count: 1000 },
});

const recoverCandidateEvaluations = async ({ olderThanMs = 0 } = {}) => {
    if (!process.env.REDIS_URL) return 0;
    const evaluationFilter = { status: "evaluating", evaluationStartedAt: { $ne: null } };
    if (olderThanMs > 0) evaluationFilter.evaluationStartedAt.$lte = new Date(Date.now() - olderThanMs);
    const strandedAttempts = await CandidateAttempt.find(evaluationFilter).select("evaluationStartedAt").lean();
    if (!strandedAttempts.length) return 0;
    const assessmentQueue = await getQueue("candidate-assessment");
    if (!assessmentQueue) return 0;
    for (const attempt of strandedAttempts) {
        await assessmentQueue.add("evaluate", { attemptId: String(attempt._id) }, candidateEvaluationJobOptions(attempt));
    }
    return strandedAttempts.length;
};

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    const hasEmailConfig = process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL;
    if (hasEmailConfig) {
        try { await verifyEmailProvider(); } catch { /* already logged */ }
    } else {
        console.log("Brevo email not configured. Set BREVO_API_KEY and BREVO_SENDER_EMAIL.");
    }

    if (process.env.REDIS_URL) {
        try {
            await createWorker("prepare-questions", prepareQuestionsProcessor);
            console.log("[Workers] prepare-questions worker started");
            await createWorker("bulk-feedback", bulkFeedbackProcessor);
            console.log("[Workers] bulk-feedback worker started");
            await createWorker("candidate-assessment", candidateAssessmentProcessor);
            console.log("[Workers] candidate-assessment worker started");
            const recovered = await recoverCandidateEvaluations();
            if (recovered) console.log(`[Workers] recovered ${recovered} candidate assessment evaluations`);
        } catch (e) {
            console.warn("[Workers] Failed to start background workers", e?.message || e);
        }
    } else {
        console.log("[Workers] REDIS_URL not set, background workers disabled");
    }

    try {
        scheduleTask("0 3 * * *", async () => {
            if (!process.env.CLOUDINARY_CLOUD_NAME) return;
            console.log("[CLEANUP] Starting orphan Cloudinary resume cleanup...");
            try {
                let totalDeleted = 0;
                for (const deliveryType of ["upload", "authenticated"]) {
                    let nextCursor;
                    do {
                        const page = await cloudinary.api.resources({
                            type: deliveryType,
                            resource_type: "raw",
                            prefix: "resumes/",
                            max_results: 500,
                            ...(nextCursor ? { next_cursor: nextCursor } : {}),
                        });
                        const publicIds = (page.resources || []).map((resource) => resource.public_id);
                        if (publicIds.length) {
                            const deliveryFilter = deliveryType === "upload"
                                ? { $or: [{ deliveryType: "upload" }, { deliveryType: { $exists: false } }] }
                                : { deliveryType: "authenticated" };
                            const existing = await Resume.find({ publicId: { $in: publicIds }, ...deliveryFilter }).select("publicId").lean();
                            const existingSet = new Set(existing.map((resume) => resume.publicId));
                            const orphans = publicIds.filter((publicId) => !existingSet.has(publicId));
                            for (let index = 0; index < orphans.length; index += 100) {
                                const batch = orphans.slice(index, index + 100);
                                try {
                                    await cloudinary.api.delete_resources(batch, { resource_type: "raw", type: deliveryType });
                                    totalDeleted += batch.length;
                                } catch (error) {
                                    console.warn(`[CLEANUP] ${deliveryType} batch delete failed`, error?.message || error);
                                }
                            }
                        }
                        nextCursor = page.next_cursor || null;
                    } while (nextCursor);
                }
                console.log(totalDeleted ? `[CLEANUP] Deleted ${totalDeleted} orphan(s)` : "[CLEANUP] No orphans found");
            } catch (e) {
                console.warn("[CLEANUP] Failed:", e?.message || e);
            }
        });
    } catch {}

    try {
        scheduleTask("* * * * *", async () => {
            try {
                const recovered = await recoverCandidateEvaluations({ olderThanMs: 60_000 });
                if (recovered) console.log(`[Workers] reconciled ${recovered} candidate assessment evaluation(s)`);
            } catch (error) {
                console.warn("[Workers] Candidate evaluation reconciliation failed", error?.message || error);
            }
        });
    } catch (error) { console.warn("[Workers] Candidate evaluation scheduler failed", error?.message || error); }

    try {
        scheduleTask("*/5 * * * *", async () => {
            const result = await deliverDuePracticeReminders();
            if (result.sent) console.log(`[REMINDERS] Sent ${result.sent} reminder(s)`);
        });
        if (process.env.REMINDER_DELIVERY_ENABLED === "true") console.log("[REMINDERS] Delivery scheduler started");
    } catch (error) { console.warn("[REMINDERS] Scheduler failed", error?.message || error); }

    try {
        scheduleTask("* * * * *", async () => {
            try {
                const result = await processAssessmentLifecycle();
                if (result.opened || result.closed || result.sent || result.failed) console.log(`[ASSESSMENTS] opened=${result.opened} closed=${result.closed} sent=${result.sent} failed=${result.failed}`);
            } catch (error) { console.warn("[ASSESSMENTS] Lifecycle processing failed", error?.message || error); }
        });
    } catch (error) { console.warn("[ASSESSMENTS] Lifecycle scheduler failed", error?.message || error); }

    try {
        scheduleTask("15 3 * * *", async () => {
            const assessments = await Assessment.find({ "integrity.enabled": true }).select("integrity.retentionDays").lean();
            for (const assessment of assessments) {
                const cutoff = new Date(Date.now() - (assessment.integrity?.retentionDays || 30) * 86400000);
                await CandidateAttempt.updateMany({ assessment: assessment._id }, { $pull: { integrityEvents: { at: { $lt: cutoff } } } });
            }
        });
    } catch (error) { console.warn("[INTEGRITY] Retention cleanup scheduler failed", error?.message || error); }

    try { stopOtlpPush = startOtlpPush() || (() => {}); } catch {}
});

let shuttingDown = false;
const closeHttpServer = () => new Promise((resolve, reject) => {
    try {
        server.close((error) => error ? reject(error) : resolve());
    } catch (error) {
        reject(error);
    }
});

const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    try { console.log(`[${signal}] draining HTTP, schedulers and workers...`); } catch {}

    const timeoutMs = Math.max(Number(process.env.SHUTDOWN_TIMEOUT_MS || 15000), 1000);
    const forceExit = setTimeout(() => {
        console.error(`[${signal}] graceful shutdown exceeded ${timeoutMs}ms; forcing exit`);
        process.exit(1);
    }, timeoutMs);
    forceExit.unref?.();

    try {
        for (const task of scheduledTasks) {
            try { task.stop?.(); } catch {}
        }
        try { stopOtlpPush(); } catch {}

        await Promise.all([closeHttpServer(), closeQueues()]);

        for (const task of scheduledTasks) {
            try { await task.destroy?.(); } catch {}
        }
        await mongoose.connection.close().catch(() => {});
        try {
            const redis = await getRedisClient();
            if (redis?.isOpen) await redis.quit();
        } catch {}

        clearTimeout(forceExit);
        process.exit(0);
    } catch (error) {
        clearTimeout(forceExit);
        console.error(`[${signal}] graceful shutdown failed:`, error?.message || error);
        process.exit(1);
    }
};

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
