import crypto from "crypto";
import Assessment from "../models/Assessment.js";
import CandidateAttempt from "../models/CandidateAttempt.js";
import Organization from "../models/Organization.js";
import { finalizeCandidateInterview } from "../services/organizationUsage.js";
import metrics from "../metrics/index.js";
import runCode from "../utils/runCode.js";
import { transcribe } from "./sttController.js";
import { getQueue } from "../queues/index.js";
import { createJobId } from "../queues/jobIds.js";
import candidateAssessmentProcessor from "../queues/workers/candidateAssessment.js";

const tokenHash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const followupLabel = (assessment) => assessment == null ? "unknown" : assessment.followUpsEnabled ? "enabled" : "disabled";
const observeCandidateAction = (action, outcome, assessment) => { try { metrics.candidateAssessmentActionsTotal.labels(action, outcome, followupLabel(assessment)).inc(); } catch {} };

const unexpired = () => ({ $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });
const findStartableAssessment = (shareToken) => Assessment.findOne({ shareToken, status: "active", ...unexpired() });
const findContinuableAssessment = (shareToken) => Assessment.findOne({ shareToken, status: { $in: ["active", "closed"] }, ...unexpired() });
const findAttempt = async (assessmentId, attemptId, rawToken) => {
    if (!rawToken) return null;
    return CandidateAttempt.findOne({
        _id: attemptId,
        assessment: assessmentId,
        accessTokenHash: tokenHash(rawToken),
    }).select("+accessTokenHash +usageReservationId");
};

const publicAssessment = (assessment, organizationName = "") => ({
    title: assessment.title,
    organizationName,
    jobRole: assessment.jobRole,
    candidateInstructions: assessment.candidateInstructions,
    contactEmail: assessment.contactEmail,
    durationMinutes: assessment.durationMinutes,
    followUpsEnabled: assessment.followUpsEnabled,
    inviteOnly: assessment.inviteOnly,
    acceptingNewCandidates: assessment.status === "active",
    expiresAt: assessment.expiresAt,
    integrity: assessment.integrity || { enabled: false },
    capabilities: {
        codeExecution: process.env.ENABLE_CODE_EXEC === "true",
        transcription: process.env.ENABLE_STT === "true",
    },
    rounds: assessment.rounds.map((round) => ({
        name: round.name,
        description: round.description,
        deliveryMode: round.deliveryMode || "conversational",
        questionCount: round.questions.length,
    })),
});

export const getPublicAssessmentForCandidate = async (req, res, next) => {
    try {
        const assessment = await findContinuableAssessment(req.params.shareToken);
        if (!assessment) { observeCandidateAction("view", "unavailable", null); return res.status(404).json({ message: "Assessment unavailable" }); }
        const invitation = req.query.invite ? assessment.invitations?.id(req.query.invite) : null;
        if (assessment.inviteOnly && (!invitation || invitation.status === "revoked")) {
            return res.status(403).json({ message: "This assessment is invitation-only. Open the invitation link sent to your email." });
        }
        if (assessment.status === "active" && invitation && ["invited", "sent", "delivered"].includes(invitation.status)) {
            await Assessment.updateOne(
                { _id: assessment._id, "invitations._id": invitation._id, "invitations.status": { $in: ["invited", "sent", "delivered"] } },
                { $set: { "invitations.$.status": "opened", "invitations.$.openedAt": new Date() } },
            );
        }
        const organization = await Organization.findById(assessment.organization).select("name").lean();
        observeCandidateAction("view", "success", assessment);
        return res.json(publicAssessment(assessment, organization?.name || ""));
    } catch (error) { return next(error); }
};

const authorizeCandidateTool = async (req, res) => {
    const assessment = await findContinuableAssessment(req.params.shareToken);
    if (!assessment) { res.status(404).json({ message: "Assessment unavailable" }); return null; }
    const attempt = await findAttempt(assessment._id, req.params.attemptId, req.get("x-attempt-token"));
    if (!attempt || attempt.status !== "started") { res.status(401).json({ message: "Attempt unavailable" }); return null; }
    return { attempt, assessment };
};

export const protectCandidateTool = async (req, res, next) => {
    try {
        const authorized = await authorizeCandidateTool(req, res);
        if (!authorized) return;
        req.candidateAttempt = authorized.attempt;
        req.candidateAssessment = authorized.assessment;
        return next();
    } catch (error) { return next(error); }
};

export const runCandidateCode = async (req, res, next) => {
    try {
        if (!req.candidateAttempt) {
            const authorized = await authorizeCandidateTool(req, res);
            if (!authorized) return;
            req.candidateAttempt = authorized.attempt;
        }
        return runCode(req, res);
    } catch (error) { return next(error); }
};

export const transcribeCandidateAudio = async (req, res, next) => {
    try {
        if (!req.candidateAttempt) {
            const authorized = await authorizeCandidateTool(req, res);
            if (!authorized) return;
            req.candidateAttempt = authorized.attempt;
        }
        return transcribe(req, res, next);
    } catch (error) { return next(error); }
};

export const recordIntegrityEvent = async (req, res, next) => {
    try {
        const assessment = await findContinuableAssessment(req.params.shareToken);
        if (!assessment?.integrity?.enabled) return res.status(204).end();
        const attempt = await findAttempt(assessment._id, req.params.attemptId, req.get("x-attempt-token"));
        if (!attempt || attempt.status !== "started") return res.status(401).json({ message: "Attempt unavailable" });
        if (attempt.integrityEvents.length >= 500) return res.status(202).json({ recorded: false });
        attempt.integrityEvents.push({ type: req.body.type, at: new Date(), metadata: req.body.metadata || {} });
        await attempt.save();
        return res.status(201).json({ recorded: true });
    } catch (error) { return next(error); }
};

export const submitCandidateAttempt = async (req, res, next) => {
    try {
        const assessment = await findContinuableAssessment(req.params.shareToken);
        if (!assessment) { observeCandidateAction("submit", "unavailable", null); return res.status(404).json({ message: "Assessment unavailable" }); }
        const authorized = await findAttempt(assessment._id, req.params.attemptId, req.get("x-attempt-token"));
        if (!authorized) { observeCandidateAction("submit", "unauthorized", assessment); return res.status(401).json({ message: "Attempt unavailable" }); }
        if (authorized.status === "evaluating") return res.status(202).json({ submitted: true, status: "evaluating", message: "Your assessment is being evaluated." });
        if (authorized.status === "submitted") return res.json({ submitted: true, status: "submitted", message: "Your assessment has already been submitted." });
        if (authorized.status !== "started" && authorized.status !== "evaluation_failed") return res.status(409).json({ message: "Attempt cannot be submitted" });

        const unanswered = authorized.rounds.flatMap((round) => round.questions).some((item) => !item.answer || (item.followUpQuestion && !item.followUpAnswer));
        if (unanswered) { observeCandidateAction("submit", "incomplete", assessment); return res.status(400).json({ message: "Answer every question and follow-up before submitting" }); }

        if (!authorized.usageFinalizedAt && authorized.usageReservationId) {
            try {
                const finalized = await finalizeCandidateInterview({ reservationId: authorized.usageReservationId });
                if (!finalized) return res.status(503).json({ message: "Submission could not reserve hiring capacity. Please retry." });
            } catch (error) {
                console.warn("Candidate usage finalization failed", error?.message || error);
                return res.status(503).json({ message: "Submission is temporarily unavailable. Please retry." });
            }
        }

        const evaluationStartedAt = new Date();
        const claimed = await CandidateAttempt.findOneAndUpdate(
            { _id: authorized._id, status: { $in: ["started", "evaluation_failed"] } },
            { $set: { status: "evaluating", evaluationError: "", evaluationStartedAt, usageFinalizedAt: authorized.usageFinalizedAt || new Date() } },
            { new: true },
        );
        if (!claimed) return res.status(202).json({ submitted: true, status: "evaluating", message: "Your assessment is already being evaluated." });

        if (process.env.NODE_ENV === "test") {
            await candidateAssessmentProcessor({ data: { attemptId: String(authorized._id) }, updateProgress: () => {} });
            return res.json({ submitted: true, status: "submitted", message: "Your assessment has been submitted to the interviewer." });
        }
        const queue = await getQueue("candidate-assessment");
        if (!queue) {
            await CandidateAttempt.updateOne({ _id: authorized._id, status: "evaluating" }, { $set: { status: "evaluation_failed", evaluationError: "Evaluation service unavailable" } });
            return res.status(503).json({ message: "Evaluation is temporarily unavailable. Please try again." });
        }
        const jobId = createJobId("candidate-assessment", { attemptId: String(authorized._id), evaluationStartedAt: claimed.evaluationStartedAt.toISOString() });
        await queue.add("evaluate", { attemptId: String(authorized._id) }, { jobId, removeOnComplete: { age: 86400, count: 1000 }, removeOnFail: { age: 604800, count: 1000 } });
        observeCandidateAction("submit", "accepted", assessment);
        return res.status(202).json({ submitted: true, status: "evaluating", message: "Your assessment was submitted and is being evaluated." });
    } catch (error) { observeCandidateAction("submit", "failure", null); return next(error); }
};

export const isAssessmentStartable = findStartableAssessment;
