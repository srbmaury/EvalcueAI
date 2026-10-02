import Assessment from "../models/Assessment.js";
import CandidateAttempt from "../models/CandidateAttempt.js";
import { releaseAttemptReservation } from "../services/organizationUsage.js";
import { generateQuestionsForRound, improveAssessmentQuestion } from "../utils/generateQuestions.js";
import metrics from "../metrics/index.js";

const publicAssessment = (assessment, organizationName = "") => ({
    title: assessment.title,
    organizationName,
    jobRole: assessment.jobRole,
    candidateInstructions: assessment.candidateInstructions,
    contactEmail: assessment.contactEmail,
    durationMinutes: assessment.durationMinutes,
    followUpsEnabled: assessment.followUpsEnabled,
    askCandidateIntro: assessment.askCandidateIntro !== false,
    inviteOnly: assessment.inviteOnly,
    expiresAt: assessment.expiresAt,
    integrity: assessment.integrity || { enabled: false },
    capabilities: {
        codeExecution: process.env.ENABLE_CODE_EXEC === "true",
        transcription: process.env.ENABLE_STT === "true",
    },
    rounds: assessment.rounds.map((round) => ({ name: round.name, description: round.description, deliveryMode: round.deliveryMode || "conversational", questionCount: round.questions.length })),
});

export const generateAssessmentQuestions = async (req, res, next) => {
    try {
        const { jobRole, jobDescription, roundName, roundDescription = "", deliveryMode = "conversational", prompt = "", count = 5, existingQuestions = [] } = req.body;
        const questions = await generateQuestionsForRound({
            company: req.organization?.name || "", jobRole, jobDescription, resumeText: "", roundName,
            roundDescription: [roundDescription, prompt ? `Interviewer generation request: ${prompt}` : ""].filter(Boolean).join("\n"),
            deliveryMode, count, excludeTexts: existingQuestions,
        });
        const texts = (questions || []).map((item) => typeof item === "string" ? item : item?.text).map((text) => (text || "").trim()).filter(Boolean).slice(0, count);
        if (!texts.length) return res.status(503).json({ message: "AI question generation is temporarily unavailable. You can still add questions manually." });
        try { metrics.assessmentsTotal.labels("question_generate", "success").inc(); } catch {}
        return res.json({ questions: texts.map((text) => ({ text })) });
    } catch (error) { try { metrics.assessmentsTotal.labels("question_generate", "failure").inc(); } catch {} return next(error); }
};

export const improveAssessmentQuestionText = async (req, res, next) => {
    try {
        const text = await improveAssessmentQuestion(req.body);
        try { metrics.assessmentsTotal.labels("question_improve", "success").inc(); } catch {}
        return res.json({ text });
    } catch (error) { try { metrics.assessmentsTotal.labels("question_improve", "failure").inc(); } catch {} return next(error); }
};

export const listAssessments = async (req, res, next) => {
    try {
        const page = Math.max(Number(req.query.page) || 1, 1); const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
        const filter = { organization: req.organizationId };
        const [total, items] = await Promise.all([
            Assessment.countDocuments(filter),
            Assessment.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        ]);
        const ids = items.map((item) => item._id);
        const counts = await CandidateAttempt.aggregate([{ $match: { assessment: { $in: ids } } }, { $group: { _id: "$assessment", total: { $sum: 1 }, submitted: { $sum: { $cond: [{ $eq: ["$status", "submitted"] }, 1, 0] } } } }]);
        const byId = new Map(counts.map((item) => [String(item._id), item]));
        return res.json({ items: items.map((item) => ({ ...item, attemptCount: byId.get(String(item._id))?.total || 0, submittedCount: byId.get(String(item._id))?.submitted || 0 })), total, page, totalPages: Math.max(Math.ceil(total / limit), 1) });
    } catch (error) { return next(error); }
};

export const getHiringOverview = async (req, res, next) => {
    try {
        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
        const search = (req.query.search || "").toString().trim().slice(0, 100);
        const status = ["started", "evaluating", "submitted", "evaluation_failed"].includes(req.query.status) ? req.query.status : "";
        const assessments = await Assessment.find({ organization: req.organizationId }).select("title jobRole status opensAt expiresAt createdAt invitations.status").sort({ createdAt: -1 }).lean();
        const assessmentIds = assessments.map((item) => item._id);
        const assessmentById = new Map(assessments.map((item) => [String(item._id), item]));
        const requestedAssessmentId = req.query.assessmentId;
        const selectedAssessmentId = assessmentById.has(String(requestedAssessmentId || "")) ? requestedAssessmentId : null;
        const attemptFilter = {
            assessment: requestedAssessmentId
                ? (selectedAssessmentId || { $in: [] })
                : { $in: assessmentIds },
        };
        if (status) attemptFilter.status = status;
        if (search) {
            const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            attemptFilter.$or = [{ candidateName: new RegExp(escaped, "i") }, { candidateEmail: new RegExp(escaped, "i") }];
        }
        const allAttemptsFilter = { assessment: { $in: assessmentIds } };
        const [totalCandidates, submitted, inProgress, scoreSummary, filteredTotal, attempts] = await Promise.all([
            CandidateAttempt.countDocuments(allAttemptsFilter),
            CandidateAttempt.countDocuments({ ...allAttemptsFilter, status: "submitted" }),
            CandidateAttempt.countDocuments({ ...allAttemptsFilter, status: { $in: ["started", "evaluating", "evaluation_failed"] } }),
            CandidateAttempt.aggregate([{ $match: { ...allAttemptsFilter, status: "submitted", overallScore: { $type: "number" } } }, { $group: { _id: null, average: { $avg: "$overallScore" } } }]),
            CandidateAttempt.countDocuments(attemptFilter),
            CandidateAttempt.find(attemptFilter).select("assessment candidateName candidateEmail status startedAt submittedAt overallScore updatedAt").sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        ]);
        const invitationCounts = assessments.flatMap((item) => item.invitations || []).reduce((counts, invitation) => ({ ...counts, [invitation.status]: (counts[invitation.status] || 0) + 1 }), {});
        return res.json({
            summary: {
                assessments: assessments.length,
                activeAssessments: assessments.filter((item) => item.status === "active").length,
                totalCandidates, submitted, inProgress,
                averageScore: scoreSummary[0]?.average == null ? null : Math.round(scoreSummary[0].average * 10) / 10,
                invitations: assessments.reduce((sum, item) => sum + (item.invitations?.length || 0), 0),
                invitationQueued: invitationCounts.queued || 0,
                invitationFailed: (invitationCounts.failed || 0) + (invitationCounts.bounced || 0),
                invitationOpened: (invitationCounts.opened || 0) + (invitationCounts.started || 0) + (invitationCounts.completed || 0),
            },
            assessments: assessments.map(({ invitations: _invitations, ...assessment }) => assessment),
            candidates: attempts.map((attempt) => ({ ...attempt, assessment: assessmentById.get(String(attempt.assessment)) || null })),
            total: filteredTotal, page, totalPages: Math.max(Math.ceil(filteredTotal / limit), 1),
        });
    } catch (error) { return next(error); }
};

export const getAssessmentReport = async (req, res, next) => {
    try {
        const assessment = await Assessment.findOne({ _id: req.params.assessmentId, organization: req.organizationId }).lean();
        if (!assessment) return res.status(404).json({ message: "Assessment not found" });
        const attempts = await CandidateAttempt.find({ assessment: assessment._id }).sort({ createdAt: -1 }).lean();
        try { metrics.assessmentReportsViewedTotal.labels(attempts.some((attempt) => attempt.status === "submitted") ? "yes" : "no").inc(); } catch {}
        return res.json({ assessment, attempts });
    } catch (error) { return next(error); }
};

export const previewAssessment = async (req, res, next) => {
    try {
        const assessment = await Assessment.findOne({ _id: req.params.assessmentId, organization: req.organizationId });
        if (!assessment) return res.status(404).json({ message: "Assessment not found" });
        return res.json({ ...publicAssessment(assessment, req.organization?.name || ""), status: assessment.status, rounds: assessment.rounds.map((round) => ({ name: round.name, description: round.description, deliveryMode: round.deliveryMode || "conversational", questionCount: round.questions.length, questions: round.questions.map((question) => ({ text: question.text })) })) });
    } catch (error) { return next(error); }
};

export const revokeInvitation = async (req, res, next) => {
    try {
        const assessment = await Assessment.findOne({ _id: req.params.assessmentId, organization: req.organizationId });
        if (!assessment) return res.status(404).json({ message: "Assessment not found" });
        const invitation = assessment.invitations.id(req.params.invitationId);
        if (!invitation) return res.status(404).json({ message: "Invitation not found" });
        invitation.status = "revoked"; invitation.revokedAt = new Date(); await assessment.save();
        // Every candidate-facing endpoint rejects any attempt whose status isn't
        // "started", so this alone cuts off access immediately through all of them —
        // an in-progress attempt otherwise kept working indefinitely on a revoked link.
        const inProgress = await CandidateAttempt.find({ assessment: assessment._id, invitation: invitation._id, status: "started" }).select("_id").lean();
        await CandidateAttempt.updateMany(
            { _id: { $in: inProgress.map((item) => item._id) }, status: "started" },
            { $set: { status: "revoked" } },
        );
        // A revoked attempt can never be submitted, so give its interview slot back to the organization.
        for (const item of inProgress) await releaseAttemptReservation(item._id).catch(() => false);
        return res.json({ invitation });
    } catch (error) { return next(error); }
};

// Lets the hiring team end an abandoned in-progress attempt and free its interview slot immediately
// instead of waiting for the reservation to expire.
export const endCandidateAttempt = async (req, res, next) => {
    try {
        const assessment = await Assessment.findOne({ _id: req.params.assessmentId, organization: req.organizationId }).select("_id");
        if (!assessment) return res.status(404).json({ message: "Assessment not found" });
        const attempt = await CandidateAttempt.findOneAndUpdate(
            { _id: req.params.attemptId, assessment: assessment._id, status: "started" },
            { $set: { status: "revoked" } },
            { new: true },
        ).select("_id status");
        if (!attempt) return res.status(409).json({ message: "Only in-progress attempts can be ended" });
        const released = await releaseAttemptReservation(attempt._id);
        return res.json({ attempt: { _id: attempt._id, status: attempt.status }, released });
    } catch (error) { return next(error); }
};

export const reviewCandidateAttempt = async (req, res, next) => {
    try {
        const assessment = await Assessment.findOne({ _id: req.params.assessmentId, organization: req.organizationId });
        if (!assessment) return res.status(404).json({ message: "Assessment not found" });
        const attempt = await CandidateAttempt.findOne({ _id: req.params.attemptId, assessment: assessment._id });
        if (!attempt) return res.status(404).json({ message: "Candidate attempt not found" });
        if (req.body.reviewerDecision && (req.body.reviewerNotes || "").trim().length < 10) return res.status(400).json({ message: "Add evidence explaining the hiring decision." });
        Object.assign(attempt, { reviewerScore: req.body.reviewerScore, reviewerDecision: req.body.reviewerDecision, reviewerNotes: req.body.reviewerNotes, reviewerRatings: req.body.reviewerRatings || [], reviewedAt: new Date() });
        await attempt.save(); return res.json({ attempt });
    } catch (error) { return next(error); }
};

export const duplicateAssessment = async (req, res, next) => {
    try {
        const source = await Assessment.findOne({ _id: req.params.assessmentId, organization: req.organizationId }).lean();
        if (!source) return res.status(404).json({ message: "Assessment not found" });
        const { _id, createdAt, updatedAt, __v, invitations, ...copy } = source;
        const nextVersion = (source.templateVersion || 1) + 1;
        const assessment = await Assessment.create({ ...copy, organization: req.organizationId, createdBy: req.user._id, title: req.body.title || `${source.title} · v${nextVersion}`, status: "draft", publishedAt: undefined, archivedAt: undefined, shareToken: crypto.randomBytes(24).toString("base64url"), invitations: [], templateVersion: nextVersion });
        return res.status(201).json(assessment);
    } catch (error) { return next(error); }
};

