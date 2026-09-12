import crypto from "crypto";
import Assessment from "../models/Assessment.js";
import CandidateAttempt from "../models/CandidateAttempt.js";
import Organization from "../models/Organization.js";
import { generateQuestionsForRound } from "../utils/generateQuestions.js";
import { runDebuggingTests } from "../services/debuggingTestRunner.js";
import { createAdaptiveAssessment } from "./hiringAdaptiveAssessmentController.js";

const tokenHash = (value) => crypto.createHash("sha256").update(value).digest("hex");

export const debuggingAssessmentsEnabled = () =>
    String(process.env.ENABLE_DEBUGGING_ASSESSMENTS || "false").toLowerCase() === "true";

export const enforceDebuggingAssessmentFeature = (req, res, next) => {
    const rounds = Array.isArray(req.body?.rounds) ? req.body.rounds : [];
    if (!rounds.some((round) => round?.deliveryMode === "debugging")) return next();
    if (debuggingAssessmentsEnabled()) return next();
    return res.status(503).json({ message: "Feature disabled" });
};

export const getDebuggingAssessmentCapabilities = (_req, res) => res.json({
    debuggingAssessments: debuggingAssessmentsEnabled(),
});

const safeDebuggingConfig = (round) => {
    if (round?.deliveryMode !== "debugging" || !round.debugging) return undefined;
    const tests = Array.isArray(round.debugging.tests) ? round.debugging.tests : [];
    return {
        responseMode: round.debugging.responseMode,
        language: round.debugging.language,
        starterCode: round.debugging.starterCode,
        visibleTestCount: tests.filter((test) => !test.hidden).length,
        hiddenTestCount: tests.filter((test) => test.hidden).length,
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

const findPublicAssessment = (shareToken) => Assessment.findOne({
    shareToken,
    status: "active",
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
});

const findAttempt = async (assessmentId, attemptId, rawToken) => {
    if (!rawToken) return null;
    return CandidateAttempt.findOne({
        _id: attemptId,
        assessment: assessmentId,
        accessTokenHash: tokenHash(rawToken),
    }).select("+accessTokenHash");
};

export const getPublicAssessmentWithDebugging = async (req, res, next) => {
    try {
        const assessment = await findPublicAssessment(req.params.shareToken);
        if (!assessment) return res.status(404).json({ message: "Assessment unavailable" });
        const invitation = req.query.invite ? assessment.invitations?.id(req.query.invite) : null;
        if (assessment.inviteOnly && (!invitation || invitation.status === "revoked")) {
            return res.status(403).json({ message: "This assessment is invitation-only. Open the invitation link sent to your email." });
        }
        if (invitation && ["invited", "sent", "delivered"].includes(invitation.status)) {
            invitation.status = "opened";
            invitation.openedAt = new Date();
            await assessment.save();
        }
        const organization = await Organization.findById(assessment.organization).select("name").lean();
        return res.json(safePublicAssessment(assessment, organization?.name || ""));
    } catch (error) {
        return next(error);
    }
};

const normalizeQuestion = (item) => ({
    text: item.text.trim(),
    weight: Number(item.weight) || 1,
    competencies: Array.isArray(item.competencies) ? item.competencies : [],
    knockout: Boolean(item.knockout),
    required: Boolean(item.required),
});

const createRoundsIncludingDebugging = async ({ rounds, req, jobRole, jobDescription }) => {
    const generatedRounds = [];
    const excludeTexts = [];

    for (const input of rounds) {
        const deliveryMode = input.deliveryMode || "conversational";
        const supplied = (input.questions || []).filter((item) => item?.text?.trim()).slice(0, 10);

        if (deliveryMode === "debugging") {
            if (!supplied.length) {
                const error = new Error(`Add assignment instructions to ${input.name}.`);
                error.statusCode = 400;
                throw error;
            }
            generatedRounds.push({
                name: input.name,
                description: input.description || "",
                deliveryMode: "debugging",
                adaptive: false,
                questionCount: 1,
                questions: [normalizeQuestion(supplied[0])],
                debugging: input.debugging,
            });
            excludeTexts.push(supplied[0].text.trim());
            continue;
        }

        const adaptive = deliveryMode === "conversational" && input.adaptive !== false;
        const requestedCount = Math.min(Math.max(Number(input.questionCount) || 3, 1), 10);

        if (deliveryMode === "conversational" && !adaptive) {
            if (!supplied.length) {
                const error = new Error(`Add at least one reviewed question to ${input.name} when AI-generated interview questions are disabled.`);
                error.statusCode = 400;
                throw error;
            }
            const questions = supplied.map(normalizeQuestion);
            generatedRounds.push({
                name: input.name,
                description: input.description || "",
                deliveryMode,
                adaptive: false,
                questionCount: questions.length,
                questions,
            });
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
        const generatedItems = (Array.isArray(generated) ? generated : [])
            .map((item) => ({ text: typeof item === "string" ? item : item?.text, required: false }))
            .filter((item) => item.text?.trim());
        const questions = [...planned, ...generatedItems].slice(0, count).map(normalizeQuestion);
        while (questions.length < count) {
            questions.push({
                text: `Describe how you would approach ${input.name} challenge ${questions.length + 1} for a ${jobRole}.`,
                weight: 1,
                competencies: [],
                knockout: false,
                required: false,
            });
        }
        excludeTexts.push(...questions.map((item) => item.text));
        generatedRounds.push({
            name: input.name,
            description: input.description || "",
            deliveryMode,
            adaptive,
            questionCount: count,
            questions,
        });
    }

    return generatedRounds;
};

export const createAssessmentWithDebugging = async (req, res, next) => {
    if (!req.body?.rounds?.some((round) => round.deliveryMode === "debugging")) {
        return createAdaptiveAssessment(req, res, next);
    }
    if (!debuggingAssessmentsEnabled()) return res.status(503).json({ message: "Feature disabled" });

    try {
        const {
            title,
            jobRole,
            jobDescription,
            followUpsEnabled = true,
            inviteOnly = false,
            candidateInstructions = "",
            contactEmail = "",
            durationMinutes = 30,
            opensAt,
            expiresAt,
            timezone = "UTC",
            rounds,
            integrity,
            rubric = [],
            templateName = "",
            status = "draft",
        } = req.body;

        if (status === "scheduled" && (!opensAt || new Date(opensAt) <= new Date())) {
            return res.status(400).json({ message: "Choose a future opening time before scheduling." });
        }
        if (expiresAt && opensAt && new Date(expiresAt) <= new Date(opensAt)) {
            return res.status(400).json({ message: "The submission deadline must be after the opening time." });
        }

        const generatedRounds = await createRoundsIncludingDebugging({ rounds, req, jobRole, jobDescription });
        const assessment = await Assessment.create({
            organization: req.organizationId,
            createdBy: req.user._id,
            title,
            jobRole,
            jobDescription,
            followUpsEnabled,
            inviteOnly,
            candidateInstructions,
            contactEmail,
            durationMinutes,
            opensAt: opensAt || undefined,
            expiresAt: expiresAt || undefined,
            timezone,
            rounds: generatedRounds,
            integrity,
            rubric,
            templateName,
            status,
            publishedAt: status === "active" ? new Date() : undefined,
            shareToken: crypto.randomBytes(24).toString("base64url"),
        });
        return res.status(201).json(assessment);
    } catch (error) {
        if (error?.statusCode) return res.status(error.statusCode).json({ message: error.message });
        return next(error);
    }
};

const publicDebugAttempt = (attempt) => ({
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
            debugCode: question.debugCode || "",
            debugFindings: question.debugFindings || undefined,
            debugTestResult: question.debugTestResult || undefined,
        })),
    })),
});

const loadDebuggingContext = async (req, res) => {
    const assessment = await findPublicAssessment(req.params.shareToken);
    if (!assessment) {
        res.status(404).json({ message: "Assessment unavailable" });
        return null;
    }
    const attempt = req.candidateAttempt || await findAttempt(
        assessment._id,
        req.params.attemptId,
        req.get("x-attempt-token"),
    );
    if (!attempt || attempt.status !== "started") {
        res.status(401).json({ message: "Attempt unavailable" });
        return null;
    }
    const roundIndex = Number(req.body.roundIndex);
    const questionIndex = Number(req.body.questionIndex);
    const assessmentRound = assessment.rounds?.[roundIndex];
    const attemptRound = attempt.rounds?.[roundIndex];
    const question = attemptRound?.questions?.[questionIndex];
    if (!assessmentRound || !attemptRound || !question || assessmentRound.deliveryMode !== "debugging") {
        res.status(400).json({ message: "Invalid debugging assignment" });
        return null;
    }
    return { assessment, attempt, assessmentRound, question };
};

const findingsAnswer = (findings) => [
    `Root cause:\n${findings.rootCause || ""}`,
    `Evidence:\n${findings.evidence || ""}`,
    `Proposed fix:\n${findings.proposedFix || ""}`,
    `Testing strategy:\n${findings.testingStrategy || ""}`,
].join("\n\n");

const codeAnswer = (code, testResult) => [
    `Candidate debugging code:\n${code || ""}`,
    testResult ? `Deterministic tests: ${testResult.passed}/${testResult.total} passed; hidden ${testResult.hiddenPassed}/${testResult.hiddenTotal} passed.` : "",
].filter(Boolean).join("\n\n");

export const saveCandidateDebuggingResponse = async (req, res, next) => {
    try {
        const context = await loadDebuggingContext(req, res);
        if (!context) return;
        const { attempt, assessmentRound, question } = context;
        const config = assessmentRound.debugging;

        if (config.responseMode === "code_fix") {
            if (req.body.code === undefined) return res.status(400).json({ message: "Code is required" });
            if (req.body.findings !== undefined) return res.status(409).json({ message: "This assignment requires a code fix" });
            question.debugCode = String(req.body.code).slice(0, 20000);
            question.answer = codeAnswer(question.debugCode, question.debugTestResult);
        } else {
            if (req.body.code !== undefined) return res.status(409).json({ message: "This assignment requires findings, not a code submission" });
            const input = req.body.findings || {};
            question.debugFindings = {
                rootCause: String(input.rootCause || "").trim().slice(0, 10000),
                evidence: String(input.evidence || "").trim().slice(0, 10000),
                proposedFix: String(input.proposedFix || "").trim().slice(0, 10000),
                testingStrategy: String(input.testingStrategy || "").trim().slice(0, 10000),
            };
            question.answer = findingsAnswer(question.debugFindings);
        }

        await attempt.save();
        return res.json(publicDebugAttempt(attempt));
    } catch (error) {
        return next(error);
    }
};

export const runCandidateDebuggingTests = async (req, res, next) => {
    try {
        const context = await loadDebuggingContext(req, res);
        if (!context) return;
        const { attempt, assessmentRound, question } = context;
        const config = assessmentRound.debugging;
        if (config.responseMode !== "code_fix") {
            return res.status(409).json({ message: "This assignment collects findings and does not execute candidate code" });
        }
        const code = String(req.body.code || "").slice(0, 20000);
        if (!code.trim()) return res.status(400).json({ message: "Code is required" });

        const summary = await runDebuggingTests({
            language: config.language,
            code,
            tests: (config.tests || []).map((test) => ({
                name: test.name,
                stdin: test.stdin || "",
                expectedOutput: test.expectedOutput || "",
                hidden: Boolean(test.hidden),
            })),
        });

        question.debugCode = code;
        question.debugTestResult = { ...summary, ranAt: new Date() };
        question.answer = codeAnswer(code, summary);
        await attempt.save();
        return res.json(summary);
    } catch (error) {
        return next(error);
    }
};
