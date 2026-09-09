import crypto from "crypto";
import Assessment from "../models/Assessment.js";
import CandidateAttempt from "../models/CandidateAttempt.js";
import SchedulerLease from "../models/SchedulerLease.js";
import { expiredCandidateReservations, releaseOrganizationUsage } from "./organizationUsage.js";
import { sendMail } from "../utils/mailer.js";
import { practiceClientOrigin } from "../config/clientOrigins.js";

const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const LIFECYCLE_LEASE_MS = Math.max(Number(process.env.ASSESSMENT_LIFECYCLE_LEASE_MS || 55_000), 15_000);

const invitationMail = (assessment, invitation) => {
    const appUrl = practiceClientOrigin();
    const link = `${appUrl}/assessment/${assessment.shareToken}?invite=${invitation._id}`;
    const deadline = assessment.expiresAt ? new Intl.DateTimeFormat("en", { dateStyle: "full", timeStyle: "short", timeZone: assessment.timezone || "UTC" }).format(assessment.expiresAt) : "No fixed deadline";
    return { to: invitation.email, subject: `Invitation: ${assessment.title}`, text: `Hi ${invitation.name || "there"},\n\nYou have been invited to complete ${assessment.title} for ${assessment.jobRole}.\n\nOpen assessment: ${link}\n\nDeadline: ${deadline} (${assessment.timezone || "UTC"}).`, html: `<p>Hi ${escapeHtml(invitation.name || "there")},</p><p>You have been invited to complete <strong>${escapeHtml(assessment.title)}</strong> for ${escapeHtml(assessment.jobRole)}.</p><p><a href="${escapeHtml(link)}">Start assessment</a></p><p>Deadline: ${escapeHtml(deadline)} (${escapeHtml(assessment.timezone || "UTC")}).</p>` };
};

const acquireLifecycleLease = async (now) => {
    const key = "assessment-lifecycle";
    const owner = `${process.pid}:${crypto.randomUUID()}`;
    try {
        const lease = await SchedulerLease.findOneAndUpdate(
            { key, $or: [{ expiresAt: { $lte: now } }, { owner }] },
            { $set: { key, owner, expiresAt: new Date(now.getTime() + LIFECYCLE_LEASE_MS) } },
            { new: true, upsert: true },
        );
        return lease?.owner === owner ? { key, owner } : null;
    } catch (error) {
        if (error?.code === 11000) return null;
        throw error;
    }
};

const releaseLifecycleLease = async (lease) => {
    if (!lease) return;
    await SchedulerLease.deleteOne({ key: lease.key, owner: lease.owner }).catch(() => {});
};

const releaseStaleCandidateReservations = async (now) => {
    let released = 0;
    for (const reservation of await expiredCandidateReservations(now, 200)) {
        try {
            const didRelease = await releaseOrganizationUsage({ reservationId: reservation._id });
            if (!didRelease) continue;
            released += 1;
            await CandidateAttempt.deleteOne({
                _id: reservation.attempt,
                status: "started",
                usageReservationId: reservation._id,
            });
        } catch (error) {
            console.warn("Candidate reservation release failed", error?.message || error);
        }
    }
    return released;
};

const reconcileInvitationAttemptStates = async (assessments) => {
    const ids = assessments.map((assessment) => assessment._id);
    if (!ids.length) return 0;
    const attempts = await CandidateAttempt.find({
        assessment: { $in: ids },
        status: { $in: ["started", "evaluating", "evaluation_failed", "submitted"] },
    }).select("assessment candidateEmail status").lean();
    const byAssessment = new Map();
    for (const attempt of attempts) {
        const key = String(attempt.assessment);
        if (!byAssessment.has(key)) byAssessment.set(key, new Map());
        byAssessment.get(key).set(attempt.candidateEmail, attempt.status);
    }

    let reconciled = 0;
    for (const assessment of assessments) {
        const states = byAssessment.get(String(assessment._id));
        if (!states) continue;
        let changed = false;
        for (const invitation of assessment.invitations || []) {
            if (["revoked", "bounced"].includes(invitation.status)) continue;
            const attemptStatus = states.get(invitation.email);
            if (!attemptStatus) continue;
            const nextStatus = attemptStatus === "submitted" ? "completed" : "started";
            if (invitation.status !== nextStatus) {
                invitation.status = nextStatus;
                changed = true;
                reconciled += 1;
            }
        }
        if (changed) await assessment.save();
    }
    return reconciled;
};

export const processAssessmentLifecycle = async (now = new Date()) => {
    const lease = await acquireLifecycleLease(now);
    if (!lease) return { opened: 0, closed: 0, sent: 0, failed: 0, released: 0, reconciled: 0, skipped: true };
    try {
        const opened = await Assessment.updateMany({ status: "scheduled", opensAt: { $lte: now }, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }, { $set: { status: "active", publishedAt: now } });
        const closed = await Assessment.updateMany({ status: { $in: ["scheduled", "active"] }, expiresAt: { $lte: now } }, { $set: { status: "closed" } });
        const released = await releaseStaleCandidateReservations(now);

        const assessments = await Assessment.find({
            status: "active",
            invitations: { $elemMatch: { status: { $in: ["queued", "failed"] }, $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }], attempts: { $lt: 5 } } },
        });
        let sent = 0;
        let failed = 0;
        for (const assessment of assessments) {
            for (const invitation of assessment.invitations) {
                if (!["queued", "failed"].includes(invitation.status) || invitation.attempts >= 5 || (invitation.nextAttemptAt && invitation.nextAttemptAt > now)) continue;
                try {
                    const info = await sendMail(invitationMail(assessment, invitation));
                    invitation.status = "sent";
                    invitation.lastSentAt = now;
                    invitation.attempts += 1;
                    invitation.providerMessageId = info?.messageId || "";
                    invitation.lastError = "";
                    sent += 1;
                } catch (error) {
                    invitation.status = "failed";
                    invitation.attempts += 1;
                    invitation.nextAttemptAt = new Date(now.getTime() + Math.min(60, 2 ** invitation.attempts) * 60_000);
                    invitation.lastError = String(error?.message || error).slice(0, 500);
                    failed += 1;
                }
            }
            await assessment.save();
        }

        const stateAssessments = await Assessment.find({
            status: { $in: ["active", "closed"] },
            "invitations.0": { $exists: true },
        });
        const reconciled = await reconcileInvitationAttemptStates(stateAssessments);
        return { opened: opened.modifiedCount || 0, closed: closed.modifiedCount || 0, sent, failed, released, reconciled };
    } finally {
        await releaseLifecycleLease(lease);
    }
};
