import crypto from "crypto";
import Assessment from "../models/Assessment.js";
import CandidateAttempt from "../models/CandidateAttempt.js";
import Organization from "../models/Organization.js";
import { reserveCandidateInterview, releaseOrganizationUsage, releaseAttemptReservation } from "../services/organizationUsage.js";
import { generateQuestionsForRound, improveAssessmentQuestion } from "../utils/generateQuestions.js";
import { generateFollowUp } from "../utils/generateQuestions/followUp.js";
import metrics from "../metrics/index.js";
import runCode from "./runCodeController.js";
import { transcribe } from "./sttController.js";
import { getQueue } from "../queues/index.js";
import { createJobId } from "../queues/jobIds.js";
import candidateAssessmentProcessor from "../queues/workers/candidateAssessment.js";
import { sendMail } from "../utils/mailer.js";
import { isValidSystemDesignDiagram, summarizeSystemDesignDiagram } from "../utils/systemDesignDiagram.js";
import { practiceClientOrigin } from "../config/clientOrigins.js";

const tokenHash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const followupLabel = (assessment) => assessment == null ? "unknown" : assessment.followUpsEnabled ? "enabled" : "disabled";
const observeCandidateAction = (action, outcome, assessment) => { try { metrics.candidateAssessmentActionsTotal.labels(action, outcome, followupLabel(assessment)).inc(); } catch {} };
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
const publicAttempt = (attempt) => ({
    _id: attempt._id,
    candidateName: attempt.candidateName,
    status: attempt.status,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    rounds: attempt.rounds.map((round) => ({
        _id: round._id,
        name: round.name,
        description: round.description,
        deliveryMode: round.deliveryMode || "conversational",
        questions: round.questions.map((question) => ({
            _id: question._id,
            text: question.text,
            answer: question.answer,
            spokenExplanation: question.spokenExplanation,
            diagramData: question.diagramData,
            diagramSummary: question.diagramSummary,
            followUpQuestion: question.followUpQuestion,
            followUpAnswer: question.followUpAnswer,
        })),
    })),
});
const findPublicAssessment = (shareToken) => Assessment.findOne({ shareToken, status: "active", $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });
const findAttempt = async (assessmentId, attemptId, rawToken) => {
    if (!rawToken) return null;
    return CandidateAttempt.findOne({ _id: attemptId, assessment: assessmentId, accessTokenHash: tokenHash(rawToken) }).select("+accessTokenHash");
};

const authorizeCandidateTool = async (req, res) => {
    const assessment = await findPublicAssessment(req.params.shareToken);
    if (!assessment) { res.status(404).json({ message: "Assessment unavailable" }); return null; }
    const attempt = await findAttempt(assessment._id, req.params.attemptId, req.get("x-attempt-token"));
    if (!attempt || attempt.status !== "started") { res.status(401).json({ message: "Attempt unavailable" }); return null; }
    return attempt;
};

export const protectCandidateTool = async (req, res, next) => {
    try {
        const attempt = await authorizeCandidateTool(req, res);
        if (!attempt) return;
        req.candidateAttempt = attempt;
        return next();
    } catch (error) { return next(error); }
};

export const runCandidateCode = async (req, res, next) => {
    try {
        if (!req.candidateAttempt && !await authorizeCandidateTool(req, res)) return;
        return runCode(req, res);
    } catch (error) { return next(error); }
};

export const transcribeCandidateAudio = async (req, res, next) => {
    try {
        if (!req.candidateAttempt && !await authorizeCandidateTool(req, res)) return;
        return transcribe(req, res, next);
    } catch (error) { return next(error); }
};

export const createAssessment = async (req, res, next) => {
    try {
        const { title, jobRole, jobDescription, followUpsEnabled = true, askCandidateIntro = true, inviteOnly = false, candidateInstructions = "", contactEmail = "", durationMinutes = 30, opensAt, expiresAt, timezone = "UTC", rounds, integrity, rubric = [], templateName = "", status = "draft" } = req.body;
        if (status === "scheduled" && (!opensAt || new Date(opensAt) <= new Date())) return res.status(400).json({ message: "Choose a future opening time before scheduling." });
        if (expiresAt && opensAt && new Date(expiresAt) <= new Date(opensAt)) return res.status(400).json({ message: "The submission deadline must be after the opening time." });
        const generatedRounds = [];
        const excludeTexts = [];
        for (const input of rounds) {
            const count = Math.min(Math.max(Number(input.questionCount) || 3, 1), 10);
            const manualTexts = (input.questions || []).map((item) => typeof item === "string" ? item : item?.text).map((item) => (item || "").toString().trim()).filter(Boolean).slice(0, count);
            let generated = [];
            if (manualTexts.length < count) try {
                generated = await generateQuestionsForRound({
                    company: req.organization?.name || "", jobRole, jobDescription, resumeText: "", roundName: input.name,
                    roundDescription: [input.description, input.aiPrompt ? `Interviewer generation request: ${input.aiPrompt}` : ""].filter(Boolean).join("\n"),
                    deliveryMode: input.deliveryMode || "conversational", count: count - manualTexts.length, excludeTexts: [...excludeTexts, ...manualTexts],
                });
            } catch { /* use deterministic fallback below */ }
            const texts = [...manualTexts, ...(Array.isArray(generated) ? generated : []).map((item) => typeof item === "string" ? item : item?.text).map((item) => (item || "").toString().trim()).filter(Boolean)].slice(0, count);
            while (texts.length < count) texts.push(`Describe how you would approach ${input.name} challenge ${texts.length + 1} for a ${jobRole}.`);
            excludeTexts.push(...texts);
            generatedRounds.push({ name: input.name, description: input.description || "", deliveryMode: input.deliveryMode || "conversational", questions: texts.map((text, index) => ({ text, weight: input.questions?.[index]?.weight || 1, competencies: input.questions?.[index]?.competencies || [], knockout: Boolean(input.questions?.[index]?.knockout) })) });
        }
        const assessment = await Assessment.create({
            organization: req.organizationId, createdBy: req.user._id, title, jobRole, jobDescription, followUpsEnabled, askCandidateIntro, inviteOnly,
            candidateInstructions, contactEmail, durationMinutes, opensAt: opensAt || undefined, expiresAt: expiresAt || undefined, timezone, rounds: generatedRounds, integrity, rubric, templateName,
            status, publishedAt: status === "active" ? new Date() : undefined, shareToken: crypto.randomBytes(24).toString("base64url"),
        });
        try { metrics.assessmentsTotal.labels("create", "success").inc(); metrics.assessmentQuestions.observe(generatedRounds.reduce((sum, round) => sum + round.questions.length, 0)); } catch {}
        return res.status(201).json(assessment);
    } catch (error) { try { metrics.assessmentsTotal.labels("create", "failure").inc(); } catch {} return next(error); }
};

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

export const updateAssessment = async (req, res, next) => {
    try {
        const assessment = await Assessment.findOne({ _id: req.params.assessmentId, organization: req.organizationId });
        if (!assessment) return res.status(404).json({ message: "Assessment not found" });
        const attempts = await CandidateAttempt.countDocuments({ assessment: assessment._id });
        if (req.body.status) {
            const transitions = { draft: ["scheduled", "active", "archived"], scheduled: ["draft", "active", "closed", "archived"], active: ["closed", "archived"], closed: ["active", "archived"], archived: [] };
            if (!transitions[assessment.status]?.includes(req.body.status)) return res.status(409).json({ message: `Assessment cannot move from ${assessment.status} to ${req.body.status}.` });
            if (["scheduled", "active"].includes(req.body.status)) {
                if (!assessment.rounds?.length || assessment.rounds.some((round) => !round.questions?.length)) return res.status(400).json({ message: "Add at least one question to every round before publishing." });
                if (assessment.expiresAt && assessment.expiresAt <= new Date()) return res.status(400).json({ message: "Choose a future submission deadline before publishing." });
                if (req.body.status === "scheduled" && (!assessment.opensAt || assessment.opensAt <= new Date())) return res.status(400).json({ message: "Choose a future opening time before scheduling." });
                if (assessment.expiresAt && assessment.opensAt && assessment.expiresAt <= assessment.opensAt) return res.status(400).json({ message: "The submission deadline must be after the opening time." });
                if (req.body.status === "active") assessment.publishedAt ||= new Date();
            }
            assessment.status = req.body.status;
            if (req.body.status === "archived") assessment.archivedAt = new Date();
        } else {
            if (assessment.status !== "draft" || attempts > 0) return res.status(409).json({ message: "Only unused draft assessments can be edited. Create a new version instead." });
            const editable = ["title", "jobRole", "jobDescription", "followUpsEnabled", "askCandidateIntro", "inviteOnly", "candidateInstructions", "contactEmail", "durationMinutes", "opensAt", "expiresAt", "timezone", "integrity", "rubric", "templateName", "rounds"];
            for (const key of editable) if (req.body[key] !== undefined) assessment[key] = req.body[key] || (key === "expiresAt" ? undefined : req.body[key]);
        }
        await assessment.save();
        try { metrics.assessmentsTotal.labels("status_update", "success").inc(); } catch {}
        return res.json(assessment);
    } catch (error) { try { metrics.assessmentsTotal.labels("status_update", "failure").inc(); } catch {} return next(error); }
};

export const getPublicAssessment = async (req, res, next) => {
    try {
        const assessment = await findPublicAssessment(req.params.shareToken);
        if (!assessment) { observeCandidateAction("view", "unavailable", null); return res.status(404).json({ message: "Assessment unavailable" }); }
        const invitation = req.query.invite ? assessment.invitations?.id(req.query.invite) : null;
        if (assessment.inviteOnly && (!invitation || invitation.status === "revoked")) {
            return res.status(403).json({ message: "This assessment is invitation-only. Open the invitation link sent to your email." });
        }
        if (invitation && ["invited", "sent", "delivered"].includes(invitation.status)) { invitation.status = "opened"; invitation.openedAt = new Date(); await assessment.save(); }
        const organization = await Organization.findById(assessment.organization).select("name").lean();
        observeCandidateAction("view", "success", assessment);
        return res.json(publicAssessment(assessment, organization?.name || ""));
    } catch (error) { return next(error); }
};

export const previewAssessment = async (req, res, next) => {
    try {
        const assessment = await Assessment.findOne({ _id: req.params.assessmentId, organization: req.organizationId });
        if (!assessment) return res.status(404).json({ message: "Assessment not found" });
        return res.json({ ...publicAssessment(assessment, req.organization?.name || ""), status: assessment.status, rounds: assessment.rounds.map((round) => ({ name: round.name, description: round.description, deliveryMode: round.deliveryMode || "conversational", questionCount: round.questions.length, questions: round.questions.map((question) => ({ text: question.text })) })) });
    } catch (error) { return next(error); }
};

export const startCandidateAttempt = async (req, res, next) => {
    let usageReservation = null;
    let attemptSaved = false;
    try {
        const assessment = await findPublicAssessment(req.params.shareToken);
        if (!assessment) { observeCandidateAction("start", "unavailable", null); return res.status(404).json({ message: "Assessment unavailable" }); }
        const candidateEmail = req.body.email.toLowerCase().trim();
        if (assessment.integrity?.enabled && req.body.integrityConsent !== true) return res.status(400).json({ message: "Consent to the configured integrity signals is required before starting this assessment." });
        const activeInvitation = req.body.invitationId ? assessment.invitations?.id(req.body.invitationId) : null;
        const validInvitation = activeInvitation && activeInvitation.status !== "revoked" && activeInvitation.email === candidateEmail ? activeInvitation : null;
        if (assessment.inviteOnly && !validInvitation) return res.status(403).json({ message: "This assessment is invitation-only. Open the invitation link sent to your email and use that invited email address." });
        const existing = await CandidateAttempt.findOne({ assessment: assessment._id, candidateEmail });
        if (existing) { observeCandidateAction("start", "duplicate", assessment); return res.status(409).json({ message: existing.status === "submitted" ? "This email has already submitted an attempt" : "An attempt for this email is already in progress. Continue from the browser where it was started or contact the recruiting team." }); }

        const usage = await reserveCandidateInterview(assessment.organization);
        if (!usage.ok) {
            observeCandidateAction("start", "capacity", assessment);
            return res.status(429).json({
                message: "This assessment is temporarily unavailable because the hiring team has reached its candidate interview capacity. Contact the recruiting team if you need help.",
                code: "HIRING_CAPACITY_REACHED",
            });
        }
        usageReservation = usage.reservation;

        const rawToken = crypto.randomBytes(32).toString("base64url");
        const rounds = assessment.rounds.map((round) => ({ name: round.name, description: round.description, deliveryMode: round.deliveryMode || "conversational", questions: round.questions.map((question) => ({ text: question.text, weight: question.weight, competencies: question.competencies, knockout: question.knockout })) }));
        const attempt = new CandidateAttempt({ assessment: assessment._id, candidateEmail });
        attempt.candidateName = req.body.name.trim(); attempt.accessTokenHash = tokenHash(rawToken); attempt.rounds = rounds; attempt.status = "started"; attempt.startedAt = new Date(); attempt.privacyConsentAt = new Date();
        if (assessment.integrity?.enabled && req.body.integrityConsent) attempt.integrityConsentAt = new Date();
        const invitation = validInvitation;
        if (invitation) invitation.status = "started";
        await attempt.save();
        attemptSaved = true;
        if (invitation) {
            try { await assessment.save(); } catch (error) { console.warn("Could not update invitation start status", error?.message || error); }
        }
        observeCandidateAction("start", "success", assessment);
        return res.status(201).json({ attemptToken: rawToken, attempt: publicAttempt(attempt) });
    } catch (error) {
        if (usageReservation && !attemptSaved) await releaseOrganizationUsage(usageReservation);
        observeCandidateAction("start", "failure", null);
        return next(error);
    }
};

export const recordIntegrityEvent = async (req, res, next) => {
    try {
        const assessment = await findPublicAssessment(req.params.shareToken);
        if (!assessment?.integrity?.enabled) return res.status(204).end();
        const attempt = await findAttempt(assessment._id, req.params.attemptId, req.get("x-attempt-token"));
        if (!attempt || attempt.status !== "started") return res.status(401).json({ message: "Attempt unavailable" });
        if (attempt.integrityEvents.length >= 500) return res.status(202).json({ recorded: false });
        attempt.integrityEvents.push({ type: req.body.type, at: new Date(), metadata: req.body.metadata || {} });
        await attempt.save();
        return res.status(201).json({ recorded: true });
    } catch (error) { return next(error); }
};

export const inviteCandidates = async (req, res, next) => {
    try {
        const assessment = await Assessment.findOne({ _id: req.params.assessmentId, organization: req.organizationId });
        if (!assessment) return res.status(404).json({ message: "Assessment not found" });
        if (!["draft", "scheduled", "active"].includes(assessment.status)) return res.status(409).json({ message: "Invitations cannot be changed for this assessment." });
        const appUrl = practiceClientOrigin();
        const link = `${appUrl}/assessment/${assessment.shareToken}`;
        const results = [];
        for (const entry of req.body.candidates) {
            const email = entry.email.toLowerCase().trim();
            let invitation = assessment.invitations.find((item) => item.email === email);
            if (!invitation) { assessment.invitations.push({ email, name: entry.name || "", status: assessment.status === "active" ? "sent" : "queued", invitedAt: new Date(), nextAttemptAt: new Date() }); invitation = assessment.invitations.at(-1); }
            else { invitation.status = assessment.status === "active" ? "sent" : "queued"; invitation.revokedAt = undefined; invitation.nextAttemptAt = new Date(); }
            if (assessment.status !== "active") { results.push({ email, sent: false, queued: true }); continue; }
            const candidateLink = `${link}?invite=${invitation._id}`;
            try {
                const info = await sendMail({ to: email, subject: `Invitation: ${assessment.title}`, text: `Hi ${entry.name || "there"},\n\nYou have been invited to complete ${assessment.title} for ${assessment.jobRole}.\n\nOpen assessment: ${candidateLink}\n\nDeadline: ${assessment.expiresAt ? assessment.expiresAt.toLocaleString() : "No fixed deadline"}.`, html: `<p>Hi ${escapeHtml(entry.name || "there")},</p><p>You have been invited to complete <strong>${escapeHtml(assessment.title)}</strong> for ${escapeHtml(assessment.jobRole)}.</p><p><a href="${escapeHtml(candidateLink)}">Start assessment</a></p><p>Deadline: ${assessment.expiresAt ? escapeHtml(assessment.expiresAt.toLocaleString()) : "No fixed deadline"}.</p>` });
                invitation.status = "sent"; invitation.lastSentAt = new Date(); invitation.attempts += 1; invitation.providerMessageId = info?.messageId || ""; invitation.lastError = ""; results.push({ email, sent: true });
            } catch (deliveryError) { invitation.status = "failed"; invitation.attempts += 1; invitation.nextAttemptAt = new Date(Date.now() + Math.min(60, 2 ** invitation.attempts) * 60_000); invitation.lastError = String(deliveryError?.message || deliveryError).slice(0, 500); results.push({ email, sent: false }); }
        }
        await assessment.save();
        return res.json({ invitations: assessment.invitations, results });
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

export const saveCandidateAnswer = async (req, res, next) => {
    try {
        const assessment = await findPublicAssessment(req.params.shareToken);
        if (!assessment) { observeCandidateAction("answer", "unavailable", null); return res.status(404).json({ message: "Assessment unavailable" }); }
        const attempt = await findAttempt(assessment._id, req.params.attemptId, req.get("x-attempt-token"));
        if (!attempt || attempt.status !== "started") { observeCandidateAction("answer", "unauthorized", assessment); return res.status(401).json({ message: "Attempt unavailable" }); }
        const { roundIndex, questionIndex, answer, spokenExplanation, followUpAnswer, diagramData } = req.body;
        const item = attempt.rounds?.[roundIndex]?.questions?.[questionIndex];
        if (!item) { observeCandidateAction("answer", "invalid_question", assessment); return res.status(400).json({ message: "Invalid question" }); }
        if (answer !== undefined) item.answer = answer.toString().trim().slice(0, 20000);
        if (spokenExplanation !== undefined) item.spokenExplanation = spokenExplanation.toString().trim().slice(0, 5000);
        if (diagramData !== undefined) {
            if (!isValidSystemDesignDiagram(diagramData)) return res.status(400).json({ message: "Invalid or overly complex system-design diagram" });
            item.diagramData = diagramData.slice(0, 500000);
            item.diagramSummary = summarizeSystemDesignDiagram(item.diagramData);
        }
        if (followUpAnswer !== undefined) item.followUpAnswer = followUpAnswer.toString().trim().slice(0, 5000);
        if (assessment.followUpsEnabled && item.answer && !item.followUpQuestion) {
            try {
                const diagramContext = item.diagramSummary || summarizeSystemDesignDiagram(item.diagramData);
                item.followUpQuestion = await generateFollowUp({ questionText: item.text, userAnswer: [item.answer, item.spokenExplanation && `Spoken explanation:\n${item.spokenExplanation}`, diagramContext].filter(Boolean).join("\n\n"), jobRole: assessment.jobRole, roundName: attempt.rounds[roundIndex].name, systemDesign: attempt.rounds[roundIndex].deliveryMode === "system-design" }) || "";
            } catch { /* The original answer remains valid when the AI provider is unavailable. */ }
        }
        await attempt.save();
        observeCandidateAction("answer", "success", assessment);
        return res.json({ attempt: publicAttempt(attempt) });
    } catch (error) { observeCandidateAction("answer", "failure", null); return next(error); }
};

export const submitCandidateAttempt = async (req, res, next) => {
    try {
        const assessment = await findPublicAssessment(req.params.shareToken);
        if (!assessment) { observeCandidateAction("submit", "unavailable", null); return res.status(404).json({ message: "Assessment unavailable" }); }
        const authorized = await findAttempt(assessment._id, req.params.attemptId, req.get("x-attempt-token"));
        if (!authorized) { observeCandidateAction("submit", "unauthorized", assessment); return res.status(401).json({ message: "Attempt unavailable" }); }
        if (authorized.status === "evaluating") return res.status(202).json({ submitted: true, status: "evaluating", message: "Your assessment is being evaluated." });
        if (authorized.status === "submitted") return res.json({ submitted: true, status: "submitted", message: "Your assessment has already been submitted." });
        if (authorized.status !== "started" && authorized.status !== "evaluation_failed") return res.status(409).json({ message: "Attempt cannot be submitted" });
        const attempt = authorized;
        const unanswered = attempt.rounds.flatMap((round) => round.questions).some((item) => !item.answer || (item.followUpQuestion && !item.followUpAnswer));
        if (unanswered) { observeCandidateAction("submit", "incomplete", assessment); return res.status(400).json({ message: "Answer every question and follow-up before submitting" }); }
        const evaluationStartedAt = new Date();
        const claimed = await CandidateAttempt.findOneAndUpdate({ _id: attempt._id, status: { $in: ["started", "evaluation_failed"] } }, { $set: { status: "evaluating", evaluationError: "", evaluationStartedAt } }, { new: true });
        if (!claimed) return res.status(202).json({ submitted: true, status: "evaluating", message: "Your assessment is already being evaluated." });
        if (process.env.NODE_ENV === "test") {
            await candidateAssessmentProcessor({ data: { attemptId: String(attempt._id) }, updateProgress: () => {} });
            return res.json({ submitted: true, status: "submitted", message: "Your assessment has been submitted to the interviewer." });
        }
        const queue = await getQueue("candidate-assessment");
        if (!queue) {
            await CandidateAttempt.updateOne({ _id: attempt._id, status: "evaluating" }, { $set: { status: "evaluation_failed", evaluationError: "Evaluation service unavailable" } });
            return res.status(503).json({ message: "Evaluation is temporarily unavailable. Please try again." });
        }
        const jobId = createJobId("candidate-assessment", { attemptId: String(attempt._id), evaluationStartedAt: claimed.evaluationStartedAt.toISOString() });
        await queue.add("evaluate", { attemptId: String(attempt._id) }, { jobId, removeOnComplete: { age: 86400, count: 1000 }, removeOnFail: { age: 604800, count: 1000 } });
        observeCandidateAction("submit", "accepted", assessment);
        return res.status(202).json({ submitted: true, status: "evaluating", message: "Your assessment was submitted and is being evaluated." });
    } catch (error) { observeCandidateAction("submit", "failure", null); return next(error); }
};
