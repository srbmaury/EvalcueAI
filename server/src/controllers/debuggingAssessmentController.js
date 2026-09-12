import crypto from "crypto";
import Assessment from "../models/Assessment.js";
import CandidateAttempt from "../models/CandidateAttempt.js";
import Organization from "../models/Organization.js";
import { generateQuestionsForRound } from "../utils/generateQuestions.js";
import {
    applyDebuggingOverlay,
    fingerprintDebuggingProject,
    sanitizeProjectForCandidate,
    summarizeDebuggingDiff,
    validateDebuggingProject,
} from "../services/debuggingProject.js";
import { buildDebuggingArchive, runDebuggingProject } from "../services/debuggingProjectRunner.js";
import { getDebuggingRuntimeProfile, supportedDebuggingRuntimes } from "../services/debuggingRuntimeProfiles.js";
import { createAdaptiveAssessment } from "./hiringAdaptiveAssessmentController.js";

const tokenHash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const cleanText = (value, max = 10000) => String(value || "").trim().slice(0, max);

export const debuggingAssessmentsEnabled = () => String(process.env.ENABLE_DEBUGGING_ASSESSMENTS || "false").toLowerCase() === "true";

export const enforceDebuggingAssessmentFeature = (req, res, next) => {
    const rounds = Array.isArray(req.body?.rounds) ? req.body.rounds : [];
    if (!rounds.some((round) => round?.deliveryMode === "debugging")) return next();
    if (debuggingAssessmentsEnabled()) return next();
    return res.status(503).json({ message: "Feature disabled" });
};

export const getDebuggingAssessmentCapabilities = (_req, res) => res.json({
    debuggingAssessments: debuggingAssessmentsEnabled(),
    debuggingRuntimes: debuggingAssessmentsEnabled() ? supportedDebuggingRuntimes() : [],
});

const normalizeDebuggingConfig = (debugging) => {
    if (!debugging) { const error = new Error("Debugging configuration is required"); error.statusCode = 400; throw error; }
    getDebuggingRuntimeProfile(debugging.runtime);
    const { files } = validateDebuggingProject(debugging.files || []);
    const responseMode = debugging.responseMode;
    if (!["code_fix", "findings"].includes(responseMode)) { const error = new Error("Choose a supported debugging response mode"); error.statusCode = 400; throw error; }
    if (!files.some((file) => file.kind === "source")) { const error = new Error("Debugging assignments require at least one source file"); error.statusCode = 400; throw error; }
    if (responseMode === "code_fix" && !files.some((file) => file.kind === "visible_test" || file.kind === "hidden_test")) { const error = new Error("Code-fix debugging assignments require at least one test file"); error.statusCode = 400; throw error; }
    return { responseMode, runtime: debugging.runtime, entryFile: cleanText(debugging.entryFile, 500), files };
};

const safeDebuggingConfig = (round) => {
    if (round?.deliveryMode !== "debugging" || !round.debugging) return undefined;
    const files = Array.isArray(round.debugging.files) ? round.debugging.files : [];
    return {
        responseMode: round.debugging.responseMode,
        runtime: round.debugging.runtime,
        entryFile: round.debugging.entryFile || "",
        sourceFileCount: files.filter((file) => file.kind === "source").length,
        visibleTestCount: files.filter((file) => file.kind === "visible_test").length,
        hiddenTestCount: files.filter((file) => file.kind === "hidden_test").length,
    };
};

const safePublicAssessment = (assessment, organizationName = "") => ({
    title: assessment.title,
    organizationName,
    jobRole: assessment.jobRole,
    candidateInstructions: assessment.candidateInstructions,
    contactEmail: assessment.contactEmail,
    durationMinutes: assessment.durationMinutes,
    followUpsEnabled: assessment.followUpsEnabled,
    inviteOnly: assessment.inviteOnly,
    expiresAt: assessment.expiresAt,
    timezone: assessment.timezone || "UTC",
    integrity: assessment.integrity || { enabled: false },
    capabilities: {
        codeExecution: process.env.ENABLE_CODE_EXEC === "true",
        transcription: process.env.ENABLE_STT === "true",
        debuggingAssessments: debuggingAssessmentsEnabled(),
    },
    rounds: assessment.rounds.map((round) => ({
        name: round.name,
        description: round.description,
        deliveryMode: round.deliveryMode || "conversational",
        questionCount: round.questions.length,
        ...(round.deliveryMode === "debugging" ? { debugging: safeDebuggingConfig(round) } : {}),
    })),
});

const findPublicAssessment = (shareToken) => Assessment.findOne({ shareToken, status: "active", $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });
const findAttempt = async (assessmentId, attemptId, rawToken) => {
    if (!rawToken) return null;
    return CandidateAttempt.findOne({ _id: attemptId, assessment: assessmentId, accessTokenHash: tokenHash(rawToken) }).select("+accessTokenHash");
};

export const getPublicAssessmentWithDebugging = async (req, res, next) => {
    try {
        const assessment = await findPublicAssessment(req.params.shareToken);
        if (!assessment) return res.status(404).json({ message: "Assessment unavailable" });
        const invitation = req.query.invite ? assessment.invitations?.id(req.query.invite) : null;
        if (assessment.inviteOnly && (!invitation || invitation.status === "revoked")) return res.status(403).json({ message: "This assessment is invitation-only. Open the invitation link sent to your email." });
        if (invitation && ["invited", "sent", "delivered"].includes(invitation.status)) { invitation.status = "opened"; invitation.openedAt = new Date(); await assessment.save(); }
        const organization = await Organization.findById(assessment.organization).select("name").lean();
        return res.json(safePublicAssessment(assessment, organization?.name || ""));
    } catch (error) { return next(error); }
};

const normalizeQuestion = (item) => ({ text: item.text.trim(), weight: Number(item.weight) || 1, competencies: Array.isArray(item.competencies) ? item.competencies : [], knockout: Boolean(item.knockout), required: Boolean(item.required) });

const createRoundsIncludingDebugging = async ({ rounds, req, jobRole, jobDescription }) => {
    const generatedRounds = [];
    const excludeTexts = [];
    for (const input of rounds) {
        const deliveryMode = input.deliveryMode || "conversational";
        const supplied = (input.questions || []).filter((item) => item?.text?.trim()).slice(0, 10);
        if (deliveryMode === "debugging") {
            if (!supplied.length) { const error = new Error(`Add assignment instructions to ${input.name}.`); error.statusCode = 400; throw error; }
            const debugging = normalizeDebuggingConfig(input.debugging);
            generatedRounds.push({ name: input.name, description: input.description || "", deliveryMode: "debugging", adaptive: false, questionCount: 1, questions: [normalizeQuestion(supplied[0])], debugging });
            excludeTexts.push(supplied[0].text.trim());
            continue;
        }
        const adaptive = deliveryMode === "conversational" && input.adaptive !== false;
        const requestedCount = Math.min(Math.max(Number(input.questionCount) || 3, 1), 10);
        if (deliveryMode === "conversational" && !adaptive) {
            if (!supplied.length) { const error = new Error(`Add at least one reviewed question to ${input.name} when AI-generated interview questions are disabled.`); error.statusCode = 400; throw error; }
            const questions = supplied.map(normalizeQuestion);
            generatedRounds.push({ name: input.name, description: input.description || "", deliveryMode, adaptive: false, questionCount: questions.length, questions });
            excludeTexts.push(...questions.map((item) => item.text));
            continue;
        }
        const count = deliveryMode === "system-design" ? 1 : requestedCount;
        const planned = supplied.slice(0, count);
        let generated = [];
        if (planned.length < count) {
            try {
                generated = await generateQuestionsForRound({
                    company: req.organization?.name || "",
                    jobRole,
                    jobDescription,
                    resumeText: "",
                    roundName: input.name,
                    roundDescription: [input.description, input.aiPrompt ? `Interviewer generation request: ${input.aiPrompt}` : ""].filter(Boolean).join("\n"),
                    deliveryMode,
                    count: count - planned.length,
                    excludeTexts: [...excludeTexts, ...planned.map((item) => item.text)],
                });
            } catch { /* deterministic fallback below */ }
        }
        const generatedItems = (Array.isArray(generated) ? generated : []).map((item) => ({ text: typeof item === "string" ? item : item?.text, required: false })).filter((item) => item.text?.trim());
        const questions = [...planned, ...generatedItems].slice(0, count).map(normalizeQuestion);
        while (questions.length < count) questions.push({ text: `Describe how you would approach ${input.name} challenge ${questions.length + 1} for a ${jobRole}.`, weight: 1, competencies: [], knockout: false, required: false });
        excludeTexts.push(...questions.map((item) => item.text));
        generatedRounds.push({ name: input.name, description: input.description || "", deliveryMode, adaptive, questionCount: count, questions });
    }
    return generatedRounds;
};

const validateConfigForPublish = async (debugging) => {
    const config = normalizeDebuggingConfig(debugging);
    buildDebuggingArchive({ files: config.files, runtime: config.runtime, includeHiddenTests: config.responseMode === "code_fix" });
    if (config.responseMode === "findings") return { valid: true, message: "Findings assignment validated.", status: "validated" };
    if (process.env.ENABLE_CODE_EXEC !== "true") { const error = new Error("Code execution must be enabled to publish a code-fix debugging assignment"); error.statusCode = 503; throw error; }
    const result = await runDebuggingProject({ files: config.files, runtime: config.runtime, includeHiddenTests: true });
    if (["compile_error", "runtime_error", "timeout"].includes(result.status)) { const error = new Error(`Assignment validation failed: starter project returned ${result.status.replaceAll("_", " ")}`); error.statusCode = 400; throw error; }
    if (result.visiblePassed === result.visibleTotal && result.hiddenPassed === result.hiddenTotal) { const error = new Error("The starter project already passes every test. Keep at least one reproducible bug for candidates to debug."); error.statusCode = 400; throw error; }
    return { valid: true, message: "Assignment validated: the project executes and reproduces at least one failing test.", status: "validated", visibleTotal: result.visibleTotal, hiddenTotal: result.hiddenTotal };
};

export const validateDebuggingAssignment = async (req, res, next) => {
    if (!debuggingAssessmentsEnabled()) return res.status(503).json({ message: "Feature disabled" });
    try {
        if (!cleanText(req.body?.instructions, 1000)) return res.status(400).json({ message: "Add candidate-facing assignment instructions before validating." });
        return res.json(await validateConfigForPublish(req.body.debugging));
    } catch (error) { if (error?.statusCode) return res.status(error.statusCode).json({ message: error.message }); return next(error); }
};

export const createAssessmentWithDebugging = async (req, res, next) => {
    if (!req.body?.rounds?.some((round) => round.deliveryMode === "debugging")) return createAdaptiveAssessment(req, res, next);
    if (!debuggingAssessmentsEnabled()) return res.status(503).json({ message: "Feature disabled" });
    try {
        const { title, jobRole, jobDescription, followUpsEnabled = true, inviteOnly = false, candidateInstructions = "", contactEmail = "", durationMinutes = 30, opensAt, expiresAt, timezone = "UTC", rounds, integrity, rubric = [], templateName = "", status = "draft" } = req.body;
        if (status === "scheduled" && (!opensAt || new Date(opensAt) <= new Date())) return res.status(400).json({ message: "Choose a future opening time before scheduling." });
        if (expiresAt && opensAt && new Date(expiresAt) <= new Date(opensAt)) return res.status(400).json({ message: "The submission deadline must be after the opening time." });
        const generatedRounds = await createRoundsIncludingDebugging({ rounds, req, jobRole, jobDescription });
        if (["active", "scheduled"].includes(status)) for (const round of generatedRounds.filter((item) => item.deliveryMode === "debugging")) await validateConfigForPublish(round.debugging);
        const assessment = await Assessment.create({ organization: req.organizationId, createdBy: req.user._id, title, jobRole, jobDescription, followUpsEnabled, inviteOnly, candidateInstructions, contactEmail, durationMinutes, opensAt: opensAt || undefined, expiresAt: expiresAt || undefined, timezone, rounds: generatedRounds, integrity, rubric, templateName, status, publishedAt: status === "active" ? new Date() : undefined, shareToken: crypto.randomBytes(24).toString("base64url") });
        return res.status(201).json(assessment);
    } catch (error) { if (error?.statusCode) return res.status(error.statusCode).json({ message: error.message }); return next(error); }
};

export const enforceDebuggingPublishValidation = async (req, res, next) => {
    if (!req.body?.status || !["active", "scheduled"].includes(req.body.status) || !debuggingAssessmentsEnabled()) return next();
    try {
        const assessment = await Assessment.findOne({ _id: req.params.assessmentId, organization: req.organizationId });
        if (!assessment) return next();
        for (const round of assessment.rounds.filter((item) => item.deliveryMode === "debugging")) await validateConfigForPublish(round.debugging);
        return next();
    } catch (error) { if (error?.statusCode) return res.status(error.statusCode).json({ message: error.message }); return next(error); }
};

const candidateAttemptPayload = (attempt) => {
    const value = attempt.toObject ? attempt.toObject() : structuredClone(attempt);
    delete value.accessTokenHash;
    delete value.reviewerScore;
    delete value.reviewerDecision;
    delete value.reviewerNotes;
    delete value.reviewerRatings;
    delete value.reviewedAt;
    value.debuggingResponses = (value.debuggingResponses || []).map((response) => ({ roundIndex: response.roundIndex, responseMode: response.responseMode, changedFiles: response.changedFiles || [], createdFiles: response.createdFiles || [], deletedFiles: response.deletedFiles || [], findings: response.findings, visibleTestRuns: response.visibleTestRuns || [], finalEvaluation: response.finalEvaluation, submittedAt: response.submittedAt }));
    return value;
};

const loadDebuggingContext = async (req, res) => {
    const assessment = await findPublicAssessment(req.params.shareToken);
    if (!assessment) { res.status(404).json({ message: "Assessment unavailable" }); return null; }
    const attempt = req.candidateAttempt || await findAttempt(assessment._id, req.params.attemptId, req.get("x-attempt-token"));
    if (!attempt || attempt.status !== "started") { res.status(401).json({ message: "Attempt unavailable" }); return null; }
    const roundIndex = Number(req.params.roundIndex);
    const assessmentRound = assessment.rounds?.[roundIndex];
    const attemptRound = attempt.rounds?.[roundIndex];
    if (!Number.isInteger(roundIndex) || !assessmentRound || !attemptRound || assessmentRound.deliveryMode !== "debugging") { res.status(400).json({ message: "Invalid debugging assignment" }); return null; }
    const config = normalizeDebuggingConfig(assessmentRound.debugging);
    let response = attempt.debuggingResponses?.find((item) => Number(item.roundIndex) === roundIndex);
    if (!response) {
        attempt.debuggingResponses.push({ roundIndex, responseMode: config.responseMode, baseProjectFingerprint: fingerprintDebuggingProject(config.files) });
        response = attempt.debuggingResponses[attempt.debuggingResponses.length - 1];
    }
    return { assessment, attempt, assessmentRound, attemptRound, roundIndex, config, response };
};

const workspacePayload = ({ assessmentRound, config, response, roundIndex }) => ({
    roundIndex,
    responseMode: config.responseMode,
    runtime: config.runtime,
    entryFile: config.entryFile || "",
    instructions: assessmentRound.questions?.[0]?.text || "",
    baseFiles: sanitizeProjectForCandidate(config.files),
    files: sanitizeProjectForCandidate(applyDebuggingOverlay(config.files, response)),
    findings: response.findings || { rootCause: "", evidence: "", proposedFix: "", impact: "", testingStrategy: "" },
    visibleTestRuns: response.visibleTestRuns || [],
    finalEvaluation: response.submittedAt ? response.finalEvaluation : undefined,
    submittedAt: response.submittedAt,
});

export const getCandidateDebuggingWorkspace = async (req, res, next) => {
    try {
        const context = await loadDebuggingContext(req, res);
        if (!context) return;
        await context.attempt.save();
        return res.json(workspacePayload(context));
    } catch (error) { if (error?.statusCode) return res.status(error.statusCode).json({ message: error.message }); return next(error); }
};

export const saveCandidateDebuggingWorkspace = async (req, res, next) => {
    try {
        const context = await loadDebuggingContext(req, res);
        if (!context) return;
        const { attempt, config, response } = context;
        if (response.submittedAt) return res.status(409).json({ message: "This debugging round has already been submitted" });
        if (config.responseMode === "code_fix") {
            const overlay = { changedFiles: req.body.changedFiles || [], createdFiles: req.body.createdFiles || [], deletedFiles: req.body.deletedFiles || [] };
            applyDebuggingOverlay(config.files, overlay);
            response.changedFiles = overlay.changedFiles;
            response.createdFiles = overlay.createdFiles;
            response.deletedFiles = overlay.deletedFiles;
        } else {
            const findings = req.body.findings || {};
            response.findings = { rootCause: cleanText(findings.rootCause), evidence: cleanText(findings.evidence), proposedFix: cleanText(findings.proposedFix), impact: cleanText(findings.impact), testingStrategy: cleanText(findings.testingStrategy) };
        }
        await attempt.save();
        return res.json(workspacePayload(context));
    } catch (error) { if (error?.statusCode) return res.status(error.statusCode).json({ message: error.message }); return next(error); }
};

export const runCandidateDebuggingProjectTests = async (req, res, next) => {
    try {
        const context = await loadDebuggingContext(req, res);
        if (!context) return;
        const { attempt, config, response } = context;
        if (config.responseMode !== "code_fix") return res.status(409).json({ message: "This assignment collects findings and does not execute candidate code" });
        if (response.submittedAt) return res.status(409).json({ message: "This debugging round has already been submitted" });
        const summary = await runDebuggingProject({ files: applyDebuggingOverlay(config.files, response), runtime: config.runtime, includeHiddenTests: false });
        response.visibleTestRuns.push({ ...summary, hiddenPassed: 0, hiddenTotal: 0, ranAt: new Date() });
        if (response.visibleTestRuns.length > 20) response.visibleTestRuns.splice(0, response.visibleTestRuns.length - 20);
        await attempt.save();
        return res.json(summary);
    } catch (error) { if (error?.statusCode) return res.status(error.statusCode).json({ message: error.message }); return next(error); }
};

const findingsAnswer = (findings) => [
    `Root cause:\n${findings.rootCause || ""}`,
    `Evidence:\n${findings.evidence || ""}`,
    `Proposed fix:\n${findings.proposedFix || ""}`,
    `Impact / risk:\n${findings.impact || ""}`,
    `Testing strategy:\n${findings.testingStrategy || ""}`,
].join("\n\n");

export const submitCandidateDebuggingRound = async (req, res, next) => {
    try {
        const context = await loadDebuggingContext(req, res);
        if (!context) return;
        const { attempt, attemptRound, config, response } = context;
        if (response.submittedAt) return res.status(409).json({ message: "This debugging round has already been submitted" });
        let summary;
        if (config.responseMode === "code_fix") {
            const execution = await runDebuggingProject({ files: applyDebuggingOverlay(config.files, response), runtime: config.runtime, includeHiddenTests: true });
            summary = { ...execution, diff: summarizeDebuggingDiff(config.files, response) };
            response.finalEvaluation = summary;
            attemptRound.questions[0].answer = `Debugging solution submitted. Visible tests: ${execution.visiblePassed}/${execution.visibleTotal}. Hidden tests: ${execution.hiddenPassed}/${execution.hiddenTotal}. Files changed: ${summary.diff.changed + summary.diff.created + summary.diff.deleted}.`;
        } else {
            const findings = response.findings || {};
            if (!cleanText(findings.rootCause) || !cleanText(findings.proposedFix) || !cleanText(findings.testingStrategy)) return res.status(400).json({ message: "Complete the root cause, proposed fix, and testing strategy before submitting." });
            summary = { status: "submitted", findings: true };
            response.finalEvaluation = summary;
            attemptRound.questions[0].answer = findingsAnswer(findings);
        }
        response.submittedAt = new Date();
        await attempt.save();
        return res.json({ summary, attempt: candidateAttemptPayload(attempt) });
    } catch (error) { if (error?.statusCode) return res.status(error.statusCode).json({ message: error.message }); return next(error); }
};
