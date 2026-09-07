import User from "../models/User.js";
import ReminderDelivery from "../models/ReminderDelivery.js";
import { sendMail } from "../utils/mailer.js";
import metrics from "../metrics/index.js";
import { practiceClientOrigin } from "../config/clientOrigins.js";

const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const localParts = (date, timeZone) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, weekday: "long", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const retryDelayMs = (attempts) => Math.min(6 * 60 * 60 * 1000, 5 * 60 * 1000 * (2 ** Math.max(0, attempts - 1)));

const mailFor = (user) => {
    const role = user.targetRole ? ` for ${user.targetRole}` : "";
    const dashboard = `${practiceClientOrigin()}/practice/dashboard`;
    return {
        to: user.email,
        subject: "Your Evalcue AI practice reminder",
        text: `Hi ${user.name},\n\nIt’s time for your interview practice${role}. A focused session today keeps your progress moving.\n\nOpen Evalcue AI: ${dashboard}\n\nChange or disable reminders from Profile & settings.`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Ready for a focused practice session?</h2><p>Hi ${escapeHtml(user.name)},</p><p>It’s time for your interview practice${escapeHtml(role)}. A focused session today keeps your progress moving.</p><p><a href="${escapeHtml(dashboard)}">Open Evalcue AI</a></p><p>You can change or disable reminders from Profile &amp; settings.</p></div>`,
    };
};

const enqueueDue = async (now) => {
    const users = await User.find({ reminderEnabled: true, isVerified: true }).select("name email targetRole reminderDay reminderTime reminderTimezone");
    let enqueued = 0;
    for (const user of users) {
        try {
            const parts = localParts(now, user.reminderTimezone || "UTC");
            const localDay = parts.weekday.toLowerCase();
            const currentMinutes = Number(parts.hour) * 60 + Number(parts.minute);
            const [hour, minute] = (user.reminderTime || "19:00").split(":").map(Number);
            const targetMinutes = hour * 60 + minute;
            // Catch up for the remainder of the user's scheduled local day.
            if (!dayNames.includes(localDay) || localDay !== user.reminderDay || currentMinutes < targetMinutes) continue;
            const reminderKey = `${parts.year}-${parts.month}-${parts.day}:${user.reminderTime}`;
            const result = await ReminderDelivery.updateOne(
                { user: user._id, reminderKey },
                { $setOnInsert: { scheduledFor: now, status: "pending", nextAttemptAt: now } },
                { upsert: true },
            );
            if (result.upsertedCount) enqueued += 1;
        } catch (error) {
            console.warn("[REMINDERS] Scheduling failed", user._id, error?.message || error);
        }
    }
    return { checked: users.length, enqueued };
};

const deliverQueued = async (now) => {
    let sent = 0;
    let failed = 0;
    for (let i = 0; i < 100; i += 1) {
        const staleLock = new Date(now.getTime() - 10 * 60 * 1000);
        const delivery = await ReminderDelivery.findOneAndUpdate(
            { nextAttemptAt: { $lte: now }, $or: [{ status: { $in: ["pending", "failed"] } }, { status: "processing", lockedAt: { $lte: staleLock } }] },
            { $set: { status: "processing", lockedAt: now }, $inc: { attempts: 1 } },
            { new: true, sort: { nextAttemptAt: 1 } },
        ).populate("user", "name email targetRole reminderEnabled isVerified");
        if (!delivery) break;
        if (!delivery.user?.reminderEnabled || !delivery.user?.isVerified) {
            await ReminderDelivery.updateOne({ _id: delivery._id }, { $set: { status: "failed", lastError: "Reminder disabled or account unverified", nextAttemptAt: new Date("9999-12-31") }, $unset: { lockedAt: 1 } });
            continue;
        }
        try {
            const startedAt = process.hrtime.bigint();
            const info = await sendMail(mailFor(delivery.user));
            await ReminderDelivery.updateOne({ _id: delivery._id }, { $set: { status: "sent", sentAt: new Date(), providerMessageId: info?.messageId || "", lastError: "" }, $unset: { lockedAt: 1 } });
            sent += 1;
            metrics.reminderDeliveriesTotal.labels("sent").inc();
            metrics.reminderDeliveryDurationSeconds.labels("sent").observe(Number(process.hrtime.bigint() - startedAt) / 1e9);
            metrics.reminderDeliveryLagSeconds.observe(Math.max(0, Date.now() - new Date(delivery.scheduledFor).getTime()) / 1000);
        } catch (error) {
            const nextAttemptAt = new Date(now.getTime() + retryDelayMs(delivery.attempts));
            await ReminderDelivery.updateOne({ _id: delivery._id }, { $set: { status: "failed", nextAttemptAt, lastError: String(error?.message || error).slice(0, 500) }, $unset: { lockedAt: 1 } });
            failed += 1;
            metrics.reminderDeliveriesTotal.labels("failed").inc();
            metrics.reminderRetriesTotal.inc();
        }
    }
    return { sent, failed };
};

export async function deliverDuePracticeReminders(now = new Date()) {
    if (process.env.REMINDER_DELIVERY_ENABLED !== "true") return { checked: 0, enqueued: 0, sent: 0, failed: 0 };
    const scheduled = await enqueueDue(now);
    const delivered = await deliverQueued(now);
    return { ...scheduled, ...delivered };
}

export async function sendTestPracticeReminder(user) {
    const info = await sendMail({ ...mailFor(user), subject: "Evalcue AI test reminder" });
    return { messageId: info?.messageId || "" };
}
