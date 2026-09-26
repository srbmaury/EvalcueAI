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
import { runDebuggingProject } from "../services/debuggingProjectRunner.js";
import { availableRuntimeIds } from "../services/codeRunner.js";
import { RUNTIME_IDS, RUNTIME_LABELS } from "../config/codeRuntimes.js";
import { createAdaptiveAssessment, publicAttempt } from "./hiringAdaptiveAssessmentController.js";

const tokenHash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const cleanText = (value, max = 10000) => String(value || "").trim().slice(0, max);
const requestError = (message, statusCode = 400) => { const error = new Error(message); error.statusCode = statusCode; return error; };

export const debuggingAssessmentsEnabled = () => String(process.env.ENABLE_DEBUGGING_ASSESSMENTS || "false").toLowerCase() === "true";

export const enforceDebuggingAssessmentFeature = (req, res, next) => {
    const rounds = Array.isArray(req.body?.rounds) ? req.body.rounds : [];
    if (!rounds.some((round) => round?.deliveryMode === "debugging")) return next();
    if (debuggingAssessmentsEnabled()) return next();
    return res.status(503).json({ message: "Feature disabled" });
};

// Every runtime can be used for findings-only rounds; code-fix rounds need one the runner can execute.
export const getDebuggingAssessmentCapabilities = async (_req, res, next) => {
    try {
        const enabled = debuggingAssessmentsEnabled();
        const executable = enabled ? await availableRuntimeIds() : [];
        return res.json({
            debuggingAssessments: enabled,
            debuggingRuntimes: enabled ? RUNTIME_IDS.map((runtime) => ({ runtime, label: RUNTIME_LABELS[runtime], executable: executable.includes(runtime) })) : [],
        });
    } catch (error) { return next(error); }
};

const normalizeDebuggingConfig = (debugging) => {
    if (!debugging) throw requestError("Debugging configuration is required");
    if (!RUNTIME_IDS.includes(debugging.runtime)) throw requestError(`Unsupported debugging runtime: ${debugging.runtime || "unknown"}`);
    const { files } = validateDebuggingProject(debugging.files || []);
    const responseMode = debugging.responseMode;
    if (!["code_fix", "findings"].includes(responseMode)) throw requestError("Choose a supported debugging response mode");
    if (!files.some((file) => file.kind === "source")) throw requestError("Debugging assignments require at least one source file");
    if (responseMode === "code_fix" && !files.some((file) => file.kind === "hidden_test")) throw requestError("Code-fix debugging assignments require at least one hidden test");
    if (responseMode === "findings" && files.some((file) => file.kind !== "source")) throw requestError("Findings assignments contain source files only");
    return { responseMode, runtime: debugging.runtime, entryFile: cleanText(debugging.entryFile, 500), files };
};

export const safeDebuggingConfig = (round) => {
    if (round?.deliveryMode !== "debugging" || !round.debugging) return undefined;
    const files = Array.isArray(round.debugging.files) ? round.debugging.files : [];
    return {
        responseMode: round.debugging.responseMode,
        runtime: round.debugging.runtime,
        entryFile: round.debugging.entryFile || "",
        sourceFileCount: files.filter((file) => file.kind === "source").length,
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
            if (!supplied.length) throw requestError(`Add assignment instructions to ${input.name}.`);
            const debugging = normalizeDebuggingConfig(input.debugging);
            generatedRounds.push({ name: input.name, description: input.description || "", deliveryMode: "debugging", adaptive: false, questionCount: 1, questions: [normalizeQuestion(supplied[0])], debugging });
            excludeTexts.push(supplied[0].text.trim());
            continue;
        }
        const adaptive = deliveryMode === "conversational" && input.adaptive !== false;
        const requestedCount = Math.min(Math.max(Number(input.questionCount) || 3, 1), 10);
        if (deliveryMode === "conversational" && !adaptive) {
            if (!supplied.length) throw requestError(`Add at least one reviewed question to ${input.name} when AI-generated interview questions are disabled.`);
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
    if (config.responseMode === "findings") return { valid: true, message: "Findings assignment validated.", status: "validated" };
    if (process.env.ENABLE_CODE_EXEC !== "true") throw requestError("Code execution must be enabled to publish a code-fix debugging assignment", 503);
    const executable = await availableRuntimeIds();
    if (!executable.includes(config.runtime)) {
        const available = executable.map((runtime) => RUNTIME_LABELS[runtime]).join(", ") || "none";
        throw requestError(`${RUNTIME_LABELS[config.runtime]} is not available on the code runner right now. Available: ${available}.`, 422);
    }
    const result = await runDebuggingProject({ files: config.files, runtime: config.runtime });
    if (["compile_error", "timeout"].includes(result.status)) throw requestError(`Assignment validation failed: starter project returned ${result.status.replaceAll("_", " ")}`);
    if (result.setupErrorCount > 0) throw requestError(`Assignment validation failed: ${result.setupErrorCount} hidden test${result.setupErrorCount === 1 ? "" : "s"} could not run because of a missing module, import, or syntax error. Check file paths and imports so tests fail only because of the intended bug.`);
    if (result.passed === result.total) throw requestError("The starter project already passes every test. Keep at least one reproducible bug for candidates to debug.");
    return { valid: true, message: "Assignment validated: the project executes and reproduces at least one failing test.", status: "validated", testTotal: result.total };
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
    // Reuse the same allowlist-based sanitizer every other candidate-facing attempt
    // response uses (hiringAdaptiveAssessmentController's publicAttempt), rather than a
    // second copy that can drift — a denylist copy here previously leaked overallScore,
    // evaluationMetadata, and per-question score/quickEvaluation/suggestions from other
    // (e.g. adaptive conversational) rounds in the same attempt straight to the candidate.
    // It also keeps this response's rounds shape consistent with the rest of the attempt
    // object the client holds in state, which this response fully replaces.
    return {
        ...publicAttempt(attempt),
        debuggingResponses: (value.debuggingResponses || []).map((response) => ({
            roundIndex: response.roundIndex,
            responseMode: response.responseMode,
            changedFiles: response.changedFiles || [],
            createdFiles: response.createdFiles || [],
            deletedFiles: response.deletedFiles || [],
            findings: response.findings || [],
            testRuns: response.testRuns || [],
            finalEvaluation: response.finalEvaluation,
            submittedAt: response.submittedAt,
        })),
    };
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
    findings: response.findings || [],
    testRuns: response.testRuns || [],
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

const normalizeCandidateFindings = (input, config) => {
    if (!Array.isArray(input)) throw requestError("Findings must be an array");
    const sourcePaths = new Set(config.files.filter((file) => file.kind === "source").map((file) => file.path));
    return input.slice(0, 50).map((finding) => {
        const filePath = cleanText(finding?.filePath, 500);
        if (!sourcePaths.has(filePath)) throw requestError("Each finding must reference a project source file");
        return {
            filePath,
            rootCause: cleanText(finding?.rootCause),
            evidence: cleanText(finding?.evidence),
            proposedFix: cleanText(finding?.proposedFix),
        };
    });
};

// Autosave and test runs can write the same attempt concurrently. On a Mongoose version conflict,
// reload the attempt and re-apply the change instead of failing the request.
const saveDebuggingChange = async (req, res, apply) => {
    for (let tries = 0; ; tries += 1) {
        const context = await loadDebuggingContext(req, res);
        if (!context) return null;
        if (apply(context) === false) return null;
        try {
            await context.attempt.save();
            return context;
        } catch (error) {
            if (error?.name !== "VersionError" || tries >= 2) throw error;
        }
    }
};

export const saveCandidateDebuggingWorkspace = async (req, res, next) => {
    try {
        const context = await loadDebuggingContext(req, res);
        if (!context) return;
        const { attempt, config, response, roundIndex } = context;
        if (response.submittedAt) return res.status(409).json({ message: "This debugging round has already been submitted" });
        const changes = {};
        if (config.responseMode === "code_fix") {
            const overlay = { changedFiles: req.body.changedFiles || [], createdFiles: req.body.createdFiles || [], deletedFiles: req.body.deletedFiles || [] };
            applyDebuggingOverlay(config.files, overlay);
            Object.assign(changes, overlay);
        } else {
            changes.findings = normalizeCandidateFindings(req.body.findings || [], config);
        }
        Object.assign(response, changes);
        const created = attempt.debuggingResponses.some((item) => item.isNew);
        if (created) {
            await attempt.save();
        } else {
            // Autosave runs often and can overlap test runs or submission; an atomic update of just this
            // round's response avoids document-version conflicts (VersionError) between those writes.
            const $set = Object.fromEntries(Object.entries(changes).map(([key, value]) => [`debuggingResponses.$[response].${key}`, value]));
            const result = await CandidateAttempt.updateOne(
                { _id: attempt._id, status: "started" },
                { $set },
                { arrayFilters: [{ "response.roundIndex": roundIndex, "response.submittedAt": null }] },
            );
            if (!result.matchedCount) return res.status(409).json({ message: "This debugging round has already been submitted" });
        }
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
        const summary = await runDebuggingProject({ files: applyDebuggingOverlay(config.files, response), runtime: config.runtime });
        const ranAt = new Date();
        const record = (target) => {
            target.testRuns.push({ ...summary, ranAt });
            if (target.testRuns.length > 20) target.testRuns.splice(0, target.testRuns.length - 20);
        };
        record(response);
        try {
            await attempt.save();
        } catch (error) {
            if (error?.name !== "VersionError") throw error;
            // An autosave landed while the tests ran; persist the run on the fresh attempt without re-executing.
            const saved = await saveDebuggingChange(req, res, ({ response: fresh }) => { record(fresh); return true; });
            if (!saved) return;
        }
        return res.json(summary);
    } catch (error) { if (error?.statusCode) return res.status(error.statusCode).json({ message: error.message }); return next(error); }
};

const findingsAnswer = (findings) => findings.map((finding, index) => [
    `Finding ${index + 1} — ${finding.filePath}`,
    `Finding / root cause:\n${finding.rootCause || ""}`,
    finding.evidence ? `Evidence:\n${finding.evidence}` : "",
    finding.proposedFix ? `Proposed fix:\n${finding.proposedFix}` : "",
].filter(Boolean).join("\n\n")).join("\n\n---\n\n");

export const submitCandidateDebuggingRound = async (req, res, next) => {
    try {
        const context = await loadDebuggingContext(req, res);
        if (!context) return;
        const { attempt, attemptRound, config, response, roundIndex } = context;
        if (response.submittedAt) return res.status(409).json({ message: "This debugging round has already been submitted" });

        let findings;
        if (config.responseMode !== "code_fix") {
            findings = Array.isArray(response.findings) ? response.findings : [];
            if (!findings.length || findings.some((finding) => !cleanText(finding.filePath, 500) || !cleanText(finding.rootCause))) {
                return res.status(400).json({ message: "Add at least one finding with a project file and finding/root cause before submitting." });
            }
        }

        // Atomically claim the submission before doing any expensive/external work
        // (sandboxed code runner): two concurrent submit requests for the same round must
        // not both execute and both persist a result — the loser gets a clean 409
        // instead of racing attempt.save() into an unhandled VersionError after
        // the runner already ran twice.
        const claimedAt = new Date();
        const claim = await CandidateAttempt.updateOne(
            { _id: attempt._id, debuggingResponses: { $elemMatch: { roundIndex, submittedAt: { $exists: false } } } },
            { $set: { "debuggingResponses.$[elem].submittedAt": claimedAt } },
            { arrayFilters: [{ "elem.roundIndex": roundIndex }] },
        );
        if (!claim.modifiedCount) return res.status(409).json({ message: "This debugging round has already been submitted" });
        response.submittedAt = claimedAt;

        let summary;
        if (config.responseMode === "code_fix") {
            const execution = await runDebuggingProject({ files: applyDebuggingOverlay(config.files, response), runtime: config.runtime });
            summary = { ...execution, diff: summarizeDebuggingDiff(config.files, response) };
            response.finalEvaluation = summary;
            attemptRound.questions[0].answer = `Debugging solution submitted. Tests: ${execution.passed}/${execution.total}. Files changed: ${summary.diff.changed + summary.diff.created + summary.diff.deleted}.`;
        } else {
            summary = { status: "submitted", findings: true, findingCount: findings.length };
            response.finalEvaluation = summary;
            attemptRound.questions[0].answer = findingsAnswer(findings);
        }
        await attempt.save();
        return res.json({ summary, attempt: candidateAttemptPayload(attempt) });
    } catch (error) { if (error?.statusCode) return res.status(error.statusCode).json({ message: error.message }); return next(error); }
};

// Findings-mode only: submitting doesn't run code or score anything immediately (that
// happens later, asynchronously, once the whole interview is submitted), so letting a
// candidate reopen and revise their findings before moving to the next round is cheap and
// safe. Code-fix mode is deliberately excluded: submitting there runs the candidate's code
// against hidden tests right away and returns the pass/fail result, so reopening it would
// mean either re-running that execution on every revision or showing a stale grade — and
// more importantly, letting candidates see results and keep retrying changes what a graded
// hiring assessment is actually measuring, which isn't a UX call to make unilaterally.
export const reopenCandidateDebuggingRound = async (req, res, next) => {
    try {
        const context = await loadDebuggingContext(req, res);
        if (!context) return;
        const { attempt, config, response, roundIndex } = context;
        if (config.responseMode === "code_fix") return res.status(409).json({ message: "This debugging format cannot be reopened after submitting." });
        if (!response.submittedAt) return res.status(409).json({ message: "This debugging round has not been submitted yet." });

        const claim = await CandidateAttempt.updateOne(
            { _id: attempt._id, debuggingResponses: { $elemMatch: { roundIndex, submittedAt: { $exists: true } } } },
            { $unset: { "debuggingResponses.$[elem].submittedAt": "", "debuggingResponses.$[elem].finalEvaluation": "" } },
            { arrayFilters: [{ "elem.roundIndex": roundIndex }] },
        );
        if (!claim.modifiedCount) return res.status(409).json({ message: "This debugging round has not been submitted yet." });
        response.submittedAt = undefined;
        response.finalEvaluation = undefined;
        return res.json(workspacePayload(context));
    } catch (error) { if (error?.statusCode) return res.status(error.statusCode).json({ message: error.message }); return next(error); }
};
