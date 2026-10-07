import express from "express";
import { z } from "zod";
import protect from "../middleware/authMiddleware.js";
import validate from "../middleware/validate.js";
import quotas from "../middleware/quotas.js";
import requireFeature from "../middleware/featureFlags.js";
import captcha from "../middleware/captcha.js";
import { uploadAudioMulter } from "../middleware/multerMemory.js";
import { requireCandidateRoundSequence } from "../middleware/candidateRoundSequence.js";
import { ObjectIdString } from "../validation/commonSchemas.js";
import { RUNTIME_IDS, SNIPPET_RUNTIMES } from "../config/codeRuntimes.js";
import audit from "../middleware/audit.js";
import { organizationContext, requireOrganizationRole } from "../middleware/organizationContext.js";
import {
    getAssessmentReport, getHiringOverview, listAssessments,
    duplicateAssessment, generateAssessmentQuestions, improveAssessmentQuestionText, previewAssessment, reviewCandidateAttempt, endCandidateAttempt, revokeInvitation,
} from "../controllers/assessmentController.js";
import { inviteHiringCandidates, updateHiringAssessment } from "../controllers/hiringAssessmentWorkflowController.js";
import {
    getPublicAssessmentForCandidate,
    protectCandidateTool,
    recordIntegrityEvent,
    runCandidateCode,
    submitCandidateAttempt,
    transcribeCandidateAudio,
} from "../controllers/candidateAttemptAccessController.js";
import { saveAdaptiveCandidateAnswer, saveCandidateIntro, startAdaptiveCandidateAttempt } from "../controllers/hiringAdaptiveAssessmentController.js";
import { getCandidateInvitationPrefill } from "../controllers/candidateInvitationController.js";
import {
    createAssessmentWithDebugging,
    enforceDebuggingAssessmentFeature,
    enforceDebuggingPublishValidation,
    getCandidateDebuggingWorkspace,
    getDebuggingAssessmentCapabilities,
    reopenCandidateDebuggingRound,
    runCandidateDebuggingProjectTests,
    saveCandidateDebuggingWorkspace,
    submitCandidateDebuggingRound,
    validateDebuggingAssignment,
} from "../controllers/debuggingAssessmentController.js";
import { getAdverseImpactReport, saveCandidateSelfIdentification } from "../controllers/fairnessController.js";
import { RACE_ETHNICITY_CATEGORIES, SEX_CATEGORIES } from "../models/CandidateSelfIdentification.js";
import { checkpointCandidateSystemDesign, saveCandidateSystemDesign } from "../controllers/systemDesignDiscussionController.js";

const router = express.Router();
const assessmentDeliveryMode = z.enum(["conversational", "online-assessment", "system-design", "debugging"]);
const questionInput = z.object({ text: z.string().trim().min(5).max(1000), weight: z.coerce.number().min(.1).max(10).optional().default(1), competencies: z.array(z.string().trim().min(1).max(80)).max(10).optional().default([]), knockout: z.boolean().optional().default(false), required: z.boolean().optional().default(false) });
const debuggingProjectFileInput = z.object({
    path: z.string().trim().min(1).max(500),
    content: z.string().max(262144).optional().default(""),
    kind: z.enum(["source", "hidden_test"]),
    displayName: z.string().trim().max(120).optional().default(""),
});
const debuggingInput = z.object({
    responseMode: z.enum(["code_fix", "findings"]),
    runtime: z.enum(RUNTIME_IDS),
    entryFile: z.string().trim().max(500).optional().default(""),
    files: z.array(debuggingProjectFileInput).min(1).max(100),
}).superRefine((value, ctx) => {
    if (!value.files.some((file) => file.kind === "source")) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["files"], message: "Debugging rounds require at least one source file" });
    if (value.responseMode === "code_fix" && !value.files.some((file) => file.kind === "hidden_test")) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["files"], message: "Code-fix debugging rounds require at least one hidden test" });
    if (value.responseMode === "findings" && value.files.some((file) => file.kind !== "source")) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["files"], message: "Findings debugging rounds contain source files only" });
});
const roundInput = z.object({
    name: z.string().trim().min(2).max(80), description: z.string().trim().max(300).optional().default(""),
    deliveryMode: assessmentDeliveryMode.optional().default("conversational"), adaptive: z.boolean().optional().default(true),
    aiPrompt: z.string().trim().max(1000).optional().default(""), questionCount: z.coerce.number().int().min(1).max(10),
    questions: z.array(questionInput).max(10).optional().default([]), debugging: debuggingInput.optional(),
}).superRefine((value, ctx) => {
    if (value.deliveryMode === "debugging" && !value.debugging) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["debugging"], message: "Debugging configuration is required" });
});
const attemptParams = z.object({ shareToken: z.string().min(20).max(100), attemptId: ObjectIdString });
const debugAttemptParams = attemptParams.extend({ roundIndex: z.coerce.number().int().min(0).max(4) });
const validTimezone = (value) => { try { Intl.DateTimeFormat("en-US", { timeZone: value }); return true; } catch { return false; } };
const optionalDate = z.union([z.literal(""), z.null(), z.coerce.date()]).optional();
const assessmentEditable = z.object({ title: z.string().trim().min(2).max(160), jobRole: z.string().trim().min(2).max(120), jobDescription: z.string().trim().min(20).max(4000), followUpsEnabled: z.boolean().optional().default(true), askCandidateIntro: z.boolean().optional().default(true), inviteOnly: z.boolean().optional().default(false), candidateInstructions: z.string().trim().max(1200).optional().default(""), contactEmail: z.union([z.string().trim().email().max(254), z.literal("")]).optional().default(""), durationMinutes: z.coerce.number().int().min(5).max(240).optional().default(30), opensAt: optionalDate, expiresAt: optionalDate, timezone: z.string().trim().max(100).refine(validTimezone, "Choose a valid IANA timezone").optional().default("UTC"), integrity: z.object({ enabled: z.boolean().default(false), requireFullscreen: z.boolean().default(false), trackFocus: z.boolean().default(true), trackClipboard: z.boolean().default(true), requireCamera: z.boolean().default(false), monitorFacePresence: z.boolean().default(false), retentionDays: z.coerce.number().int().min(1).max(365).default(30) }).optional(), rubric: z.array(z.object({ name: z.string().trim().min(2).max(80), description: z.string().trim().max(300).optional().default(""), weight: z.coerce.number().min(1).max(100).default(1) })).max(12).optional().default([]), templateName: z.string().trim().max(160).optional().default(""), rounds: z.array(roundInput).min(1).max(5) });
const assessmentStatus = z.enum(["draft", "scheduled", "active", "closed", "archived"]);
const assessmentUpdate = z.union([assessmentEditable.extend({ status: assessmentStatus.optional() }), z.object({ status: assessmentStatus })]);
const systemDesignCandidateBody = z.object({ roundIndex: z.number().int().min(0).max(4), questionIndex: z.number().int().min(0).max(9), transcript: z.string().max(20000).optional().default(""), diagramData: z.string().max(500000).optional().default(""), previousInterjections: z.array(z.string().max(600)).max(8).optional().default([]), forceInteraction: z.boolean().optional().default(false), candidateAskedQuestion: z.boolean().optional().default(false), candidateQuestion: z.string().max(300).optional().default("") });
const debuggingFindingInput = z.object({ filePath: z.string().trim().min(1).max(500), rootCause: z.string().max(10000).optional().default(""), evidence: z.string().max(10000).optional().default(""), proposedFix: z.string().max(10000).optional().default("") });
const debuggingOverlayFile = z.object({ path: z.string().trim().min(1).max(500), content: z.string().max(262144) });
const debuggingWorkspaceBody = z.object({
    changedFiles: z.array(debuggingOverlayFile).max(100).optional().default([]),
    createdFiles: z.array(debuggingOverlayFile).max(100).optional().default([]),
    deletedFiles: z.array(z.string().trim().min(1).max(500)).max(100).optional().default([]),
    findings: z.array(debuggingFindingInput).max(50).optional(),
});
const debuggingValidationBody = z.object({ instructions: z.string().trim().min(5).max(1000), debugging: debuggingInput });

const shapeReviewerOverview = (req, res, next) => {
    if (req.organizationRole !== "reviewer") return next();
    const send = res.json.bind(res);
    res.json = (body) => send({
        ...body,
        summary: {},
        assessments: (body?.assessments || []).map((assessment) => ({ _id: assessment._id, title: assessment.title })),
        candidates: (body?.candidates || []).map((candidate) => ({
            ...candidate,
            assessment: candidate.assessment ? { _id: candidate.assessment._id, title: candidate.assessment.title } : null,
        })),
    });
    return next();
};

router.get("/public/:shareToken/invitation/:invitationId", validate(z.object({ shareToken: z.string().min(20).max(100), invitationId: ObjectIdString }), "params"), getCandidateInvitationPrefill);
router.get("/public/:shareToken", validate(z.object({ shareToken: z.string().min(20).max(100) }), "params"), validate(z.object({ invite: ObjectIdString.optional() }), "query"), getPublicAssessmentForCandidate);
// Candidates often share one office/campus IP, so the per-IP limit is generous; the per-email limit is
// what stops a single person from spamming new attempts.
router.post("/public/:shareToken/start", quotas({ key: (req) => `assessment-start:${req.params.shareToken}:${req.ip}`, metricKey: "assessment_start", windowSeconds: 3600, maxPerWindow: Number(process.env.ASSESSMENT_START_PER_IP_PER_HOUR || 40) }), quotas({ key: (req) => `assessment-start-email:${req.params.shareToken}:${String(req.body?.email || "").trim().toLowerCase().slice(0, 254)}`, metricKey: "assessment_start_email", windowSeconds: 3600, maxPerWindow: 5 }), captcha(), validate(z.object({ shareToken: z.string().min(20).max(100) }), "params"), validate(z.object({ name: z.string().trim().min(1).max(120), email: z.string().trim().email().max(254), privacyConsent: z.literal(true), integrityConsent: z.boolean().optional().default(false), invitationId: ObjectIdString.optional(), captchaToken: z.string().min(1).max(5000).optional() })), startAdaptiveCandidateAttempt);
router.put("/public/:shareToken/attempts/:attemptId/intro", quotas({ key: (req) => `assessment-intro:${req.params.attemptId}:${req.ip}`, metricKey: "assessment_intro", windowSeconds: 3600, maxPerWindow: 10 }), validate(attemptParams, "params"), validate(z.object({ answer: z.string().max(3000).optional(), skip: z.boolean().optional() }).strict()), saveCandidateIntro);
router.put("/public/:shareToken/attempts/:attemptId/answer", quotas({ key: (req) => `assessment-answer:${req.params.attemptId}:${req.ip}`, metricKey: "assessment_answer", windowSeconds: 3600, maxPerWindow: 120 }), validate(attemptParams, "params"), validate(z.object({ roundIndex: z.number().int().min(0).max(4), questionIndex: z.number().int().min(0).max(9), answer: z.string().max(20000).optional(), spokenExplanation: z.string().max(5000).optional(), followUpAnswer: z.string().max(5000).optional(), diagramData: z.string().max(500000).optional() }).refine((body) => body.answer !== undefined || body.spokenExplanation !== undefined || body.followUpAnswer !== undefined || body.diagramData !== undefined)), requireCandidateRoundSequence, saveAdaptiveCandidateAnswer);
router.get("/public/:shareToken/attempts/:attemptId/debugging/:roundIndex", requireFeature("ENABLE_DEBUGGING_ASSESSMENTS"), validate(debugAttemptParams, "params"), protectCandidateTool, requireCandidateRoundSequence, getCandidateDebuggingWorkspace);
router.put("/public/:shareToken/attempts/:attemptId/debugging/:roundIndex/workspace", requireFeature("ENABLE_DEBUGGING_ASSESSMENTS"), validate(debugAttemptParams, "params"), validate(debuggingWorkspaceBody), protectCandidateTool, requireCandidateRoundSequence, quotas({ key: (req) => `assessment-debug-save:${req.params.attemptId}:${req.ip}`, metricKey: "assessment_debug_save", windowSeconds: 3600, maxPerWindow: 240 }), saveCandidateDebuggingWorkspace);
router.post("/public/:shareToken/attempts/:attemptId/debugging/:roundIndex/run-tests", requireFeature("ENABLE_DEBUGGING_ASSESSMENTS"), requireFeature("ENABLE_CODE_EXEC"), validate(debugAttemptParams, "params"), protectCandidateTool, requireCandidateRoundSequence, quotas({ key: (req) => `assessment-debug-run:${req.params.attemptId}:${req.ip}`, metricKey: "assessment_debug_run", windowSeconds: 3600, maxPerWindow: 120 }), runCandidateDebuggingProjectTests);
router.post("/public/:shareToken/attempts/:attemptId/debugging/:roundIndex/submit", requireFeature("ENABLE_DEBUGGING_ASSESSMENTS"), validate(debugAttemptParams, "params"), protectCandidateTool, requireCandidateRoundSequence, quotas({ key: (req) => `assessment-debug-submit:${req.params.attemptId}:${req.ip}`, metricKey: "assessment_debug_submit", windowSeconds: 3600, maxPerWindow: 20 }), submitCandidateDebuggingRound);
router.post("/public/:shareToken/attempts/:attemptId/debugging/:roundIndex/reopen", requireFeature("ENABLE_DEBUGGING_ASSESSMENTS"), validate(debugAttemptParams, "params"), protectCandidateTool, requireCandidateRoundSequence, quotas({ key: (req) => `assessment-debug-reopen:${req.params.attemptId}:${req.ip}`, metricKey: "assessment_debug_reopen", windowSeconds: 3600, maxPerWindow: 20 }), reopenCandidateDebuggingRound);
router.post("/public/:shareToken/attempts/:attemptId/system-design/checkpoint", quotas({ key: (req) => `assessment-system-design:${req.params.attemptId}:${req.ip}`, metricKey: "assessment_system_design_checkpoint", windowSeconds: 3600, maxPerWindow: 240 }), validate(attemptParams, "params"), validate(systemDesignCandidateBody), requireCandidateRoundSequence, checkpointCandidateSystemDesign);
router.put("/public/:shareToken/attempts/:attemptId/system-design/complete", quotas({ key: (req) => `assessment-system-design-complete:${req.params.attemptId}:${req.ip}`, metricKey: "assessment_system_design_complete", windowSeconds: 3600, maxPerWindow: 20 }), validate(attemptParams, "params"), validate(systemDesignCandidateBody.extend({ transcript: z.string().trim().min(1).max(20000) })), requireCandidateRoundSequence, saveCandidateSystemDesign);
router.post("/public/:shareToken/attempts/:attemptId/submit", quotas({ key: (req) => `assessment-submit:${req.params.attemptId}:${req.ip}`, metricKey: "assessment_submit", windowSeconds: 3600, maxPerWindow: 5 }), validate(attemptParams, "params"), submitCandidateAttempt);
router.post("/public/:shareToken/attempts/:attemptId/integrity-events", quotas({ key: (req) => `assessment-integrity:${req.params.attemptId}:${req.ip}`, metricKey: "assessment_integrity", windowSeconds: 3600, maxPerWindow: 500 }), validate(attemptParams, "params"), validate(z.object({ type: z.enum(["tab_hidden", "window_blur", "fullscreen_exit", "copy", "paste", "offline", "online", "face_missing", "face_restored", "multiple_faces", "camera_interrupted", "face_detection_unavailable"]), metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional().default({}) })), recordIntegrityEvent);
router.post("/public/:shareToken/attempts/:attemptId/run-code", requireFeature("ENABLE_CODE_EXEC"), validate(attemptParams, "params"), protectCandidateTool, quotas({ key: (req) => `assessment-code:${req.params.attemptId}:${req.ip}`, metricKey: "assessment_run_code", windowSeconds: 3600, maxPerWindow: 120 }), validate(z.object({ language: z.enum(Object.keys(SNIPPET_RUNTIMES)), code: z.string().min(1).max(20000), stdin: z.string().max(20000).optional() })), runCandidateCode);
router.post("/public/:shareToken/attempts/:attemptId/transcribe", requireFeature("ENABLE_STT"), validate(attemptParams, "params"), protectCandidateTool, quotas({ key: (req) => `assessment-stt:${req.params.attemptId}:${req.ip}`, metricKey: "assessment_stt", windowSeconds: 3600, maxPerWindow: 600 }), uploadAudioMulter.single("audio"), transcribeCandidateAudio);
router.put("/public/:shareToken/attempts/:attemptId/self-identification", quotas({ key: (req) => `assessment-self-id:${req.params.attemptId}:${req.ip}`, metricKey: "assessment_self_id", windowSeconds: 3600, maxPerWindow: 10 }), validate(attemptParams, "params"), validate(z.object({ sex: z.enum(["", ...SEX_CATEGORIES]).optional().default(""), raceEthnicity: z.enum(["", ...RACE_ETHNICITY_CATEGORIES]).optional().default("") }).strict()), saveCandidateSelfIdentification);

router.use(protect, organizationContext);
router.get("/capabilities", getDebuggingAssessmentCapabilities);
router.post("/debugging/validate", requireOrganizationRole("owner", "admin", "recruiter"), requireFeature("ENABLE_DEBUGGING_ASSESSMENTS"), validate(debuggingValidationBody), quotas({ key: (req) => `assessment-debug-validate:${req.user._id}`, metricKey: "assessment_debug_validate", windowSeconds: 3600, maxPerWindow: 60 }), validateDebuggingAssignment);
router.get("/", requireOrganizationRole("owner", "admin", "recruiter", "hiring_manager"), listAssessments);
router.get("/overview", validate(z.object({ page: z.coerce.number().int().min(1).optional(), limit: z.coerce.number().int().min(1).max(50).optional(), search: z.string().trim().max(100).optional(), status: z.enum(["started", "evaluating", "submitted", "evaluation_failed"]).optional(), assessmentId: ObjectIdString.optional() }), "query"), shapeReviewerOverview, getHiringOverview);
router.post("/questions/generate", requireOrganizationRole("owner", "admin", "recruiter"), quotas({ key: (req) => `assessment-question-generate:${req.user._id}`, metricKey: "assessment_question_generate", windowSeconds: 3600, maxPerWindow: 30 }), validate(z.object({ jobRole: z.string().trim().min(2).max(120), jobDescription: z.string().trim().min(20).max(4000), roundName: z.string().trim().min(2).max(80), roundDescription: z.string().trim().max(300).optional().default(""), deliveryMode: assessmentDeliveryMode.optional().default("conversational"), prompt: z.string().trim().min(3).max(1000), count: z.coerce.number().int().min(1).max(10), existingQuestions: z.array(z.string().trim().min(5).max(1000)).max(20).optional().default([]) })), generateAssessmentQuestions);
router.post("/questions/improve", requireOrganizationRole("owner", "admin", "recruiter"), quotas({ key: (req) => `assessment-question-improve:${req.user._id}`, metricKey: "assessment_question_improve", windowSeconds: 3600, maxPerWindow: 60 }), validate(z.object({ question: z.string().trim().min(5).max(1000), instruction: z.string().trim().max(500).optional().default(""), jobRole: z.string().trim().max(120).optional().default(""), jobDescription: z.string().trim().max(4000).optional().default(""), roundName: z.string().trim().max(80).optional().default("") })), improveAssessmentQuestionText);
router.post("/", requireOrganizationRole("owner", "admin", "recruiter"), enforceDebuggingAssessmentFeature, validate(assessmentEditable.extend({ status: z.enum(["draft", "scheduled", "active"]).optional().default("draft") })), audit("assessment.create", { entityType: "Assessment", pickBody: (body) => ({ status: body.status, inviteOnly: body.inviteOnly, rounds: body.rounds?.length, integrityEnabled: body.integrity?.enabled }) }), createAssessmentWithDebugging);
router.get("/fairness", requireOrganizationRole("owner", "admin"), validate(z.object({ assessmentId: ObjectIdString.optional() }), "query"), audit("assessment.fairness_report.view", { entityType: "Organization", getEntityId: (req) => req.organizationId }), getAdverseImpactReport);
router.get("/:assessmentId", validate(z.object({ assessmentId: ObjectIdString }), "params"), getAssessmentReport);
router.get("/:assessmentId/preview", requireOrganizationRole("owner", "admin", "recruiter", "hiring_manager"), validate(z.object({ assessmentId: ObjectIdString }), "params"), previewAssessment);
router.post("/:assessmentId/duplicate", requireOrganizationRole("owner", "admin", "recruiter"), validate(z.object({ assessmentId: ObjectIdString }), "params"), validate(z.object({ title: z.string().trim().min(2).max(160).optional() })), audit("assessment.duplicate", { entityType: "Assessment", getEntityId: (_req, _body, response) => response?._id }), duplicateAssessment);
router.post("/:assessmentId/invitations", requireOrganizationRole("owner", "admin", "recruiter"), validate(z.object({ assessmentId: ObjectIdString }), "params"), validate(z.object({ candidates: z.array(z.object({ email: z.string().trim().email().max(254), name: z.string().trim().max(120).optional().default("") })).min(1).max(100) })), audit("assessment.invite", { entityType: "Assessment", getEntityId: (req) => req.params.assessmentId, pickBody: (body) => ({ candidateCount: body.candidates?.length }) }), inviteHiringCandidates);
router.delete("/:assessmentId/invitations/:invitationId", requireOrganizationRole("owner", "admin", "recruiter"), validate(z.object({ assessmentId: ObjectIdString, invitationId: ObjectIdString }), "params"), audit("assessment.invitation.revoke", { entityType: "Assessment", getEntityId: (req) => req.params.assessmentId }), revokeInvitation);
router.post("/:assessmentId/attempts/:attemptId/end", requireOrganizationRole("owner", "admin", "recruiter"), validate(z.object({ assessmentId: ObjectIdString, attemptId: ObjectIdString }), "params"), audit("assessment.attempt.end", { entityType: "CandidateAttempt", getEntityId: (req) => req.params.attemptId }), endCandidateAttempt);
router.patch("/:assessmentId/attempts/:attemptId/review", requireOrganizationRole("owner", "admin", "recruiter", "hiring_manager", "reviewer"), validate(z.object({ assessmentId: ObjectIdString, attemptId: ObjectIdString }), "params"), validate(z.object({ reviewerScore: z.coerce.number().min(0).max(10), reviewerDecision: z.enum(["", "advance", "hold", "reject"]), reviewerNotes: z.string().trim().max(5000).optional().default(""), reviewerRatings: z.array(z.object({ criterion: z.string().trim().min(1).max(80), score: z.coerce.number().min(0).max(10), note: z.string().trim().max(1000).optional().default("") })).max(12).optional().default([]) })), audit("assessment.review", { entityType: "CandidateAttempt", getEntityId: (req) => req.params.attemptId, pickBody: (body) => ({ reviewerScore: body.reviewerScore, reviewerDecision: body.reviewerDecision, ratingCount: body.reviewerRatings?.length }) }), reviewCandidateAttempt);
router.patch("/:assessmentId", requireOrganizationRole("owner", "admin", "recruiter"), enforceDebuggingAssessmentFeature, validate(z.object({ assessmentId: ObjectIdString }), "params"), validate(assessmentUpdate), enforceDebuggingPublishValidation, audit("assessment.update", { entityType: "Assessment", getEntityId: (req) => req.params.assessmentId, pickBody: (body) => ({ status: body.status, contentUpdated: Object.keys(body).some((key) => key !== "status") }) }), updateHiringAssessment);

export default router;
