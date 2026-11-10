import Assessment from "../models/Assessment.js";
import CandidateAttempt from "../models/CandidateAttempt.js";
import metrics from "../metrics/index.js";
import {
    applyEditableAssessmentFields,
    canTransitionAssessmentStatus,
    hasEditableAssessmentContent,
} from "../utils/hiringAssessmentUpdatePolicy.js";

const validatePublishable = (assessment, nextStatus) => {
    if (!["scheduled", "active"].includes(nextStatus)) return "";
    if (!assessment.rounds?.length || assessment.rounds.some((round) => !round.questions?.length)) return "Add at least one question to every round before publishing.";
    if (assessment.expiresAt && assessment.expiresAt <= new Date()) return "Choose a future submission deadline before publishing.";
    if (nextStatus === "scheduled" && (!assessment.opensAt || assessment.opensAt <= new Date())) return "Choose a future opening time before scheduling.";
    if (assessment.expiresAt && assessment.opensAt && assessment.expiresAt <= assessment.opensAt) return "The submission deadline must be after the opening time.";
    return "";
};

export const updateHiringAssessment = async (req, res, next) => {
    try {
        const assessment = await Assessment.findOne({ _id: req.params.assessmentId, organization: req.organizationId });
        if (!assessment) return res.status(404).json({ message: "Assessment not found" });

        const attempts = await CandidateAttempt.countDocuments({ assessment: assessment._id });
        const hasContent = hasEditableAssessmentContent(req.body);
        const requestedStatus = req.body.status;

        if (hasContent) {
            if (assessment.status !== "draft" || attempts > 0) return res.status(409).json({ message: "Only unused draft assessments can be edited. Create a new version instead." });
            applyEditableAssessmentFields(assessment, req.body);
        }

        if (requestedStatus && requestedStatus !== assessment.status) {
            if (!canTransitionAssessmentStatus(assessment.status, requestedStatus)) return res.status(409).json({ message: `Assessment cannot move from ${assessment.status} to ${requestedStatus}.` });
            const validationError = validatePublishable(assessment, requestedStatus);
            if (validationError) return res.status(400).json({ message: validationError });
            assessment.status = requestedStatus;
            if (requestedStatus === "active") assessment.publishedAt ||= new Date();
            if (requestedStatus === "archived") assessment.archivedAt = new Date();
        } else if (!hasContent && !requestedStatus) {
            return res.status(400).json({ message: "No assessment changes were supplied." });
        }

        await assessment.save();
        try { metrics.assessmentsTotal.labels("status_update", "success").inc(); } catch {}
        return res.json(assessment);
    } catch (error) {
        try { metrics.assessmentsTotal.labels("status_update", "failure").inc(); } catch {}
        return next(error);
    }
};

export const inviteHiringCandidates = async (req, res, next) => {
    try {
        const assessment = await Assessment.findOne({ _id: req.params.assessmentId, organization: req.organizationId });
        if (!assessment) return res.status(404).json({ message: "Assessment not found" });
        if (!["draft", "scheduled", "active"].includes(assessment.status)) return res.status(409).json({ message: "Invitations cannot be changed for this assessment." });

        const results = [];
        const seen = new Set();
        for (const entry of req.body.candidates) {
            const email = entry.email.toLowerCase().trim();
            if (seen.has(email)) continue;
            seen.add(email);
            let invitation = assessment.invitations.find((item) => item.email === email);
            if (!invitation) {
                assessment.invitations.push({ email, name: entry.name || "", status: "queued", invitedAt: new Date(), nextAttemptAt: new Date() });
                invitation = assessment.invitations.at(-1);
            } else if (!["started", "completed"].includes(invitation.status)) {
                invitation.name = entry.name || invitation.name || "";
                invitation.status = "queued";
                invitation.revokedAt = undefined;
                invitation.nextAttemptAt = new Date();
                invitation.attempts = 0;
            }
            results.push({ email, sent: false, queued: invitation.status === "queued", unchanged: ["started", "completed"].includes(invitation.status) });
        }

        await assessment.save();
        return res.json({ invitations: assessment.invitations, results });
    } catch (error) {
        return next(error);
    }
};
