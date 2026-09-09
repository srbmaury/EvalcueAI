import crypto from "crypto";
import express from "express";
import Assessment from "../models/Assessment.js";

const router = express.Router();
const safeEqual = (left, right) => {
    const a = Buffer.from(String(left || "")); const b = Buffer.from(String(right || ""));
    return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
};

const parseProviderEventAt = (body = {}) => {
    const unix = Number(body.ts_event || body.timestamp || 0);
    if (Number.isFinite(unix) && unix > 0) {
        const millis = unix > 10_000_000_000 ? unix : unix * 1000;
        const parsed = new Date(millis);
        if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    const raw = body.date || body.eventAt || body.event_at;
    if (raw) {
        const parsed = new Date(raw);
        if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
};

router.post("/brevo", async (req, res, next) => {
    try {
        const configured = process.env.BREVO_WEBHOOK_SECRET;
        const supplied = req.get("x-evalcue-webhook-secret") || req.query.secret;
        if (!configured || !safeEqual(supplied, configured)) return res.status(401).json({ message: "Invalid webhook secret" });
        const event = String(req.body?.event || "").toLowerCase();
        const messageId = String(req.body?.["message-id"] || req.body?.messageId || "").trim();
        const status = ["delivered"].includes(event) ? "delivered" : ["hard_bounce", "soft_bounce", "blocked", "invalid_email", "spam", "complaint"].includes(event) ? "bounced" : null;
        if (!status || !messageId) return res.json({ received: true, updated: false });

        const eventAt = parseProviderEventAt(req.body);
        const providerEventId = String(req.body?.["event-id"] || req.body?.eventId || `${messageId}:${event}:${eventAt.toISOString()}`).slice(0, 500);
        const terminalStatuses = ["opened", "started", "completed", "revoked"];
        const match = {
            invitations: {
                $elemMatch: {
                    providerMessageId: messageId,
                    status: { $nin: terminalStatuses },
                    providerEventId: { $ne: providerEventId },
                    $or: [
                        { providerEventAt: { $exists: false } },
                        { providerEventAt: null },
                        { providerEventAt: { $lte: eventAt } },
                    ],
                },
            },
        };
        const result = await Assessment.updateOne(match, {
            $set: {
                "invitations.$.status": status,
                "invitations.$.lastError": status === "bounced" ? event : "",
                "invitations.$.providerEventId": providerEventId,
                "invitations.$.providerEventAt": eventAt,
            },
        });
        return res.json({ received: true, updated: Boolean(result.modifiedCount) });
    } catch (error) { return next(error); }
});

export default router;
