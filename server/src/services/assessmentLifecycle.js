import Assessment from "../models/Assessment.js";
import { sendMail } from "../utils/mailer.js";
import { buildHiringInvitationEmail } from "../utils/hiringInvitationEmail.js";
import { practiceClientOrigin } from "../config/clientOrigins.js";

const invitationMail = (assessment, invitation) => {
    const candidateLink = `${practiceClientOrigin()}/assessment/${assessment.shareToken}?invite=${invitation._id}`;
    return buildHiringInvitationEmail({
        candidateName: invitation.name || "there",
        candidateEmail: invitation.email,
        organizationName: assessment.organization?.name || "Hiring team",
        assessmentTitle: assessment.title,
        jobRole: assessment.jobRole,
        durationMinutes: assessment.durationMinutes,
        opensAt: assessment.opensAt,
        expiresAt: assessment.expiresAt,
        timezone: assessment.timezone || "UTC",
        candidateLink,
        contactEmail: assessment.contactEmail || "",
        inviteOnly: assessment.inviteOnly,
        integrity: assessment.integrity || { enabled: false },
    });
};

export const processAssessmentLifecycle = async (now = new Date()) => {
    const opened = await Assessment.updateMany({ status: "scheduled", opensAt: { $lte: now }, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }, { $set: { status: "active", publishedAt: now } });
    const closed = await Assessment.updateMany({ status: { $in: ["scheduled", "active"] }, expiresAt: { $lte: now } }, { $set: { status: "closed" } });
    const assessments = await Assessment.find({ status: "active", invitations: { $elemMatch: { status: { $in: ["queued", "failed"] }, $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }], attempts: { $lt: 5 } } } }).populate("organization", "name");
    let sent = 0; let failed = 0;
    for (const assessment of assessments) {
        for (const invitation of assessment.invitations) {
            if (!["queued", "failed"].includes(invitation.status) || invitation.attempts >= 5 || (invitation.nextAttemptAt && invitation.nextAttemptAt > now)) continue;
            try { const info = await sendMail(invitationMail(assessment, invitation)); invitation.status = "sent"; invitation.lastSentAt = now; invitation.attempts += 1; invitation.providerMessageId = info?.messageId || ""; invitation.lastError = ""; sent += 1; }
            catch (error) { invitation.status = "failed"; invitation.attempts += 1; invitation.nextAttemptAt = new Date(now.getTime() + Math.min(60, 2 ** invitation.attempts) * 60_000); invitation.lastError = String(error?.message || error).slice(0, 500); failed += 1; }
            // Persist each invitation's outcome immediately, not once at the end of the
            // whole assessment's loop: this cron tick can be re-entered every minute
            // (see noOverlap on its schedule), and a slow batch or a crash partway
            // through must not leave an already-sent invitation looking "queued" again,
            // which would resend a duplicate email on the next tick.
            await assessment.save();
        }
    }
    return { opened: opened.modifiedCount || 0, closed: closed.modifiedCount || 0, sent, failed };
};
