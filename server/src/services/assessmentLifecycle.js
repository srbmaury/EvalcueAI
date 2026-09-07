import Assessment from "../models/Assessment.js";
import { sendMail } from "../utils/mailer.js";
import { practiceClientOrigin } from "../config/clientOrigins.js";

const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

const invitationMail = (assessment, invitation) => {
    const appUrl = practiceClientOrigin();
    const link = `${appUrl}/assessment/${assessment.shareToken}?invite=${invitation._id}`;
    const deadline = assessment.expiresAt ? new Intl.DateTimeFormat("en", { dateStyle: "full", timeStyle: "short", timeZone: assessment.timezone || "UTC" }).format(assessment.expiresAt) : "No fixed deadline";
    return { to: invitation.email, subject: `Invitation: ${assessment.title}`, text: `Hi ${invitation.name || "there"},\n\nYou have been invited to complete ${assessment.title} for ${assessment.jobRole}.\n\nOpen assessment: ${link}\n\nDeadline: ${deadline} (${assessment.timezone || "UTC"}).`, html: `<p>Hi ${escapeHtml(invitation.name || "there")},</p><p>You have been invited to complete <strong>${escapeHtml(assessment.title)}</strong> for ${escapeHtml(assessment.jobRole)}.</p><p><a href="${escapeHtml(link)}">Start assessment</a></p><p>Deadline: ${escapeHtml(deadline)} (${escapeHtml(assessment.timezone || "UTC")}).</p>` };
};

export const processAssessmentLifecycle = async (now = new Date()) => {
    const opened = await Assessment.updateMany({ status: "scheduled", opensAt: { $lte: now }, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }, { $set: { status: "active", publishedAt: now } });
    const closed = await Assessment.updateMany({ status: { $in: ["scheduled", "active"] }, expiresAt: { $lte: now } }, { $set: { status: "closed" } });
    const assessments = await Assessment.find({ status: "active", invitations: { $elemMatch: { status: { $in: ["queued", "failed"] }, $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }], attempts: { $lt: 5 } } } });
    let sent = 0; let failed = 0;
    for (const assessment of assessments) {
        for (const invitation of assessment.invitations) {
            if (!["queued", "failed"].includes(invitation.status) || invitation.attempts >= 5 || (invitation.nextAttemptAt && invitation.nextAttemptAt > now)) continue;
            try { const info = await sendMail(invitationMail(assessment, invitation)); invitation.status = "sent"; invitation.lastSentAt = now; invitation.attempts += 1; invitation.providerMessageId = info?.messageId || ""; invitation.lastError = ""; sent += 1; }
            catch (error) { invitation.status = "failed"; invitation.attempts += 1; invitation.nextAttemptAt = new Date(now.getTime() + Math.min(60, 2 ** invitation.attempts) * 60_000); invitation.lastError = String(error?.message || error).slice(0, 500); failed += 1; }
        }
        await assessment.save();
    }
    return { opened: opened.modifiedCount || 0, closed: closed.modifiedCount || 0, sent, failed };
};
