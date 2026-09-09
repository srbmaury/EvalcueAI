import crypto from "crypto";
import Assessment from "../models/Assessment.js";
import CandidateAttempt from "../models/CandidateAttempt.js";
import { reserveCandidateInterview, releaseOrganizationUsage } from "../services/organizationUsage.js";
import { generateQuestionsForRound } from "../utils/generateQuestions.js";
import { generateFollowUp, MAX_FOLLOW_UPS } from "../utils/generateQuestions/followUp.js";
import { isValidSystemDesignDiagram, summarizeSystemDesignDiagram } from "../utils/systemDesignDiagram.js";
import { normalizeEmail } from "../utils/identity.js";
import metrics from "../metrics/index.js";
import {
    initializeAdaptiveInterviewState,
    evaluateAdaptiveAnswer,
    applyEvidenceToState,
    shouldStopAdaptiveRound,
    chooseNextCompetency,
    selectResumeClaimForTarget,
    generateNextAdaptiveQuestion,
} from "../services/adaptiveInterviewEngine.js";

const tokenHash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const unexpiredFilter = () => ({ $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });
const findPublicAssessment = (shareToken) => Assessment.findOne({ shareToken, status: "active", ...unexpiredFilter() });
const findContinuableAssessment = (shareToken) => Assessment.findOne({ shareToken, status: { $in: ["active", "closed"] }, ...unexpiredFilter() });
const findAttempt = async (assessmentId, attemptId, rawToken) => rawToken
    ? CandidateAttempt.findOne({ _id: attemptId, assessment: assessmentId, accessTokenHash: tokenHash(rawToken) }).select("+accessTokenHash")
    : null;
const followupLabel = (assessment) => assessment == null ? "unknown" : assessment.followUpsEnabled ? "enabled" : "disabled";
const observeCandidateAction = (action, outcome, assessment) => { try { metrics.candidateAssessmentActionsTotal.labels(action, outcome, followupLabel(assessment)).inc(); } catch {} };

const followUpList = (item) => Array.isArray(item?.followUps) ? item.followUps : [];
const pendingFollowUpFor = (item) => [...followUpList(item)].reverse().find((followUp) => followUp?.question && !followUp?.answer) || null;
const ensureFollowUpHistory = (item) => {
    if (!item) return [];
    if (!Array.isArray(item.followUps)) item.followUps = [];
    if (!item.followUps.length && item.followUpQuestion) {
        item.followUps.push({ question: item.followUpQuestion, answer: item.followUpAnswer || "", answeredAt: item.followUpAnswer ? new Date() : undefined });
    }
    return item.followUps;
};
const syncLegacyFollowUpFields = (item) => {
    const history = ensureFollowUpHistory(item);
    const pending = pendingFollowUpFor(item);
    const current = pending || history.at(-1);
    item.followUpQuestion = current?.question || "";
    item.followUpAnswer = pending ? "" : current?.answer || "";
};
const baseAnswer = (item) => [
    item.answer,
    item.diagramSummary,
    item.spokenExplanation ? `Spoken explanation:\n${item.spokenExplanation}` : "",
].filter(Boolean).join("\n\n");
const combinedAnswer = (item) => [
    baseAnswer(item),
    ...followUpList(item).filter((followUp) => followUp?.question && followUp?.answer).map((followUp, index) => `Follow-up ${index + 1}: ${followUp.question}\nCandidate: ${followUp.answer}`),
].filter(Boolean).join("\n\n");

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
        adaptive: Boolean(round.adaptiveState?.enabled),
        adaptiveComplete: Boolean(round.adaptiveComplete),
        maxQuestions: Number(round.adaptiveState?.maxQuestions) || round.questions.length,
        questionsAsked: Number(round.adaptiveState?.questionsAsked) || round.questions.filter((question) => question.answer).length,
        questions: round.questions.map((question) => {
            const history = followUpList(question);
            const pending = pendingFollowUpFor(question);
            const current = pending || history.at(-1);
            return {
                _id: question._id,
                text: question.text,
                answer: question.answer,
                spokenExplanation: question.spokenExplanation,
                diagramData: question.diagramData,
                diagramSummary: question.diagramSummary,
                followUps: history.map((followUp) => ({ question: followUp.question, answer: followUp.answer || "" })),
                followUpQuestion: current?.question || question.followUpQuestion || "",
                followUpAnswer: pending ? "" : current?.answer || question.followUpAnswer || "",
                followUpNumber: pending ? history.length : 0,
                remainingFollowUps: Math.max(0, MAX_FOLLOW_UPS - history.length),
            };
        }),
    })),
});

export const createAdaptiveAssessment = async (req, res, next) => {
    try {
        const { title, jobRole, jobDescription, followUpsEnabled = true, inviteOnly = false, candidateInstructions = "", contactEmail = "", durationMinutes = 30, opensAt, expiresAt, timezone = "UTC", rounds, integrity, rubric = [], templateName = "", status = "draft" } = req.body;
        if (status === "scheduled" && (!opensAt || new Date(opensAt) <= new Date())) return res.status(400).json({ message: "Choose a future opening time before scheduling." });
        if (expiresAt && opensAt && new Date(expiresAt) <= new Date(opensAt)) return res.status(400).json({ message: "The submission deadline must be after the opening time." });

        const generatedRounds = [];
        const excludeTexts = [];
        for (const input of rounds) {
            const deliveryMode = input.deliveryMode || "conversational";
            const adaptive = deliveryMode === "conversational" && input.adaptive !== false;
            const requestedCount = Math.min(Math.max(Number(input.questionCount) || 3, 1), 10);
            const supplied = (input.questions || []).filter((item) => item?.text?.trim()).slice(0, 10);

            if (deliveryMode === "conversational" && !adaptive) {
                if (!supplied.length) return res.status(400).json({ message: `Add at least one reviewed question to ${input.name} when AI-generated interview questions are disabled.` });
                const questions = supplied.map((item) => ({
                    text: item.text.trim(),
                    weight: Number(item.weight) || 1,
                    competencies: Array.isArray(item.competencies) ? item.competencies : [],
                    knockout: Boolean(item.knockout),
                    required: Boolean(item.required),
                }));
                excludeTexts.push(...questions.map((item) => item.text));
                generatedRounds.push({ name: input.name, description: input.description || "", deliveryMode, adaptive: false, questionCount: questions.length, questions });
                continue;
            }

            const count = requestedCount;
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
                } catch { /* deterministic fill below keeps draft creation usable */ }
            }
            const generatedItems = (Array.isArray(generated) ? generated : []).map((item) => ({ text: typeof item === "string" ? item : item?.text, required: false })).filter((item) => item.text?.trim());
            const questions = [...planned, ...generatedItems].slice(0, count).map((item) => ({
                text: item.text.trim(),
                weight: Number(item.weight) || 1,
                competencies: Array.isArray(item.competencies) ? item.competencies : [],
                knockout: Boolean(item.knockout),
                required: Boolean(item.required),
            }));
            while (questions.length < count) questions.push({ text: `Describe how you would approach ${input.name} challenge ${questions.length + 1} for a ${jobRole}.`, weight: 1, competencies: [], knockout: false, required: false });
            excludeTexts.push(...questions.map((item) => item.text));
            generatedRounds.push({ name: input.name, description: input.description || "", deliveryMode, adaptive, questionCount: count, questions });
        }

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
    } catch (error) { return next(error); }
};

const asAttemptQuestion = (question, state, fallbackCompetency = "") => ({
    text: question.text,
    weight: question.weight,
    competencies: question.competencies?.length ? question.competencies : fallbackCompetency ? [fallbackCompetency] : [],
    knockout: question.knockout,
    required: Boolean(question.required),
    difficulty: state?.currentDifficulty || 3,
    sourceType: "planned",
    followUps: [],
});

const makeAttemptRound = async (assessment, round) => {
    const adaptive = round.deliveryMode === "conversational" && round.adaptive === true;
    if (!adaptive) return {
        name: round.name,
        description: round.description,
        deliveryMode: round.deliveryMode || "conversational",
        adaptiveComplete: true,
        questions: round.questions.map((question) => ({ text: question.text, weight: question.weight, competencies: question.competencies, knockout: question.knockout, required: Boolean(question.required), followUps: [] })),
    };

    const skills = [...new Set(round.questions.flatMap((question) => question.competencies || []))];
    const state = await initializeAdaptiveInterviewState({ jobRole: assessment.jobRole, jobDescription: assessment.jobDescription, roundName: round.name, roundDescription: round.description, skills, maxQuestions: Number(round.questionCount) || round.questions.length });
    const requiredCount = round.questions.filter((question) => question.required).length;
    const openingTarget = chooseNextCompetency(state);
    let first;
    if (Number(state.maxQuestions || 1) > requiredCount) {
        const opening = await generateNextAdaptiveQuestion({
            interview: { jobRole: assessment.jobRole, jobDescription: assessment.jobDescription, company: "" },
            round: { name: round.name, description: `${round.description || ""}\nThis is the opening question for the round. Start broad and conversational: briefly invite the candidate to introduce their relevant experience or walk through one representative example before moving into narrower technical depth. Keep it high-signal and role-relevant, not generic small talk.` },
            state,
            targetCompetency: openingTarget,
            difficulty: Math.min(Number(state.currentDifficulty) || 3, 3),
            sourceClaim: "",
            excludeTexts: [],
        });
        first = { text: opening.text, weight: 1, competencies: opening.competencies?.length ? opening.competencies : [openingTarget], knockout: false, required: false, difficulty: opening.difficulty, sourceType: "opening", sourceClaim: "", followUps: [] };
    } else {
        const plannedFirst = round.questions.find((question) => question.required) || round.questions[0];
        first = asAttemptQuestion(plannedFirst, state, openingTarget);
    }
    return { name: round.name, description: round.description, deliveryMode: round.deliveryMode || "conversational", adaptiveState: state, adaptiveComplete: false, questions: [first] };
};

export const startAdaptiveCandidateAttempt = async (req, res, next) => {
    let usageReservation = null;
    let attemptSaved = false;
    try {
        const assessment = await findPublicAssessment(req.params.shareToken);
        if (!assessment) { observeCandidateAction("start", "unavailable", null); return res.status(404).json({ message: "Assessment unavailable" }); }
        const candidateEmail = normalizeEmail(req.body.email);
        if (assessment.integrity?.enabled && req.body.integrityConsent !== true) return res.status(400).json({ message: "Consent to the configured integrity signals is required before starting this assessment." });
        const activeInvitation = req.body.invitationId ? assessment.invitations?.id(req.body.invitationId) : null;
        const validInvitation = activeInvitation && activeInvitation.status !== "revoked" && activeInvitation.email === candidateEmail ? activeInvitation : null;
        if (assessment.inviteOnly && !validInvitation) return res.status(403).json({ message: "This assessment is invitation-only. Open the invitation link sent to your email and use that invited email address." });
        const existing = await CandidateAttempt.findOne({ assessment: assessment._id, candidateEmail });
        if (existing) { observeCandidateAction("start", "duplicate", assessment); return res.status(409).json({ message: existing.status === "submitted" ? "This email has already submitted an attempt" : "An attempt for this email is already in progress. Continue from the browser where it was started or contact the recruiting team." }); }

        const usage = await reserveCandidateInterview(assessment.organization);
        if (!usage.ok) { observeCandidateAction("start", "capacity", assessment); return res.status(429).json({ message: "This assessment is temporarily unavailable because the hiring team has reached its candidate interview capacity. Contact the recruiting team if you need help.", code: "HIRING_CAPACITY_REACHED" }); }
        usageReservation = usage.reservation;

        const rawToken = crypto.randomBytes(32).toString("base64url");
        const attemptRounds = [];
        for (const round of assessment.rounds) attemptRounds.push(await makeAttemptRound(assessment, round));
        const now = new Date();
        const attempt = new CandidateAttempt({
            assessment: assessment._id,
            candidateEmail,
            candidateName: req.body.name.trim(),
            accessTokenHash: tokenHash(rawToken),
            usageReservationCounterId: usageReservation.counterId,
            usageReservedAt: now,
            rounds: attemptRounds,
            status: "started",
            startedAt: now,
            privacyConsentAt: now,
            integrityConsentAt: assessment.integrity?.enabled && req.body.integrityConsent ? now : undefined,
        });
        await attempt.save();
        attemptSaved = true;
        if (validInvitation) {
            try {
                await Assessment.updateOne(
                    { _id: assessment._id, "invitations._id": validInvitation._id, "invitations.status": { $ne: "revoked" } },
                    { $set: { "invitations.$.status": "started" } },
                );
            } catch (error) {
                console.warn("Could not update invitation start status; lifecycle reconciliation will retry", error?.message || error);
            }
        }
        observeCandidateAction("start", "success", assessment);
        return res.status(201).json({ attemptToken: rawToken, attempt: publicAttempt(attempt) });
    } catch (error) {
        if (usageReservation && !attemptSaved) await releaseOrganizationUsage(usageReservation);
        observeCandidateAction("start", "failure", null);
        return next(error);
    }
};

const nextRequiredQuestion = (assessmentRound, attemptRound) => {
    const asked = new Set((attemptRound.questions || []).filter((question) => question.required).map((question) => question.text.trim()));
    return (assessmentRound?.questions || []).find((question) => question.required && !asked.has(question.text.trim())) || null;
};

const decideNextAdaptiveFollowUp = async ({ assessment, round, item }) => {
    const history = ensureFollowUpHistory(item);
    const pending = pendingFollowUpFor(item);
    if (pending) { syncLegacyFollowUpFields(item); return pending; }
    if (history.length >= MAX_FOLLOW_UPS) { syncLegacyFollowUpFields(item); return null; }
    const decision = await generateFollowUp({ questionText: item.text, userAnswer: baseAnswer(item), followUps: history, jobRole: assessment.jobRole, roundName: round.name, systemDesign: round.deliveryMode === "system-design", competencies: item.competencies || [], sourceClaim: item.sourceClaim || "" });
    if (!decision?.shouldAsk || !decision.followUp) { syncLegacyFollowUpFields(item); return null; }
    history.push({ question: decision.followUp, answer: "", reason: decision.reason || "", focus: decision.focus || "" });
    syncLegacyFollowUpFields(item);
    return pendingFollowUpFor(item);
};

const advanceAdaptiveRound = async ({ assessment, attempt, roundIndex, questionIndex }) => {
    const round = attempt.rounds[roundIndex];
    const item = round?.questions?.[questionIndex];
    if (!round?.adaptiveState?.enabled || !item || item.adaptiveEvaluated) return;
    if (!item.answer?.trim() || pendingFollowUpFor(item)) return;

    const evaluation = await evaluateAdaptiveAnswer({ questionText: item.text, answerText: combinedAnswer(item), targetedCompetencies: item.competencies || [], sourceClaim: item.sourceClaim || "", state: round.adaptiveState, jobRole: assessment.jobRole, roundName: round.name });
    item.quickEvaluation = evaluation;
    item.adaptiveEvaluated = true;
    round.adaptiveState = applyEvidenceToState(round.adaptiveState, evaluation, { questionIndex, targetedCompetencies: item.competencies || [], sourceClaim: item.sourceClaim || "" });

    const required = nextRequiredQuestion(assessment.rounds?.[roundIndex], round);
    if (required && round.questions.length < Number(round.adaptiveState.maxQuestions || 1)) {
        round.questions.push(asAttemptQuestion(required, round.adaptiveState, evaluation.policy?.targetCompetency || chooseNextCompetency(round.adaptiveState)));
        return;
    }

    const stop = shouldStopAdaptiveRound(round.adaptiveState, evaluation);
    if (stop.stop || round.questions.length >= Number(round.adaptiveState.maxQuestions || 1)) {
        round.adaptiveComplete = true;
        round.adaptiveState.completedReason = stop.reason || "Adaptive question budget completed.";
        return;
    }

    const targetCompetency = evaluation.policy?.targetCompetency || chooseNextCompetency(round.adaptiveState);
    const claim = selectResumeClaimForTarget(round.adaptiveState, targetCompetency, evaluation.policy?.sourceClaim || "");
    const next = await generateNextAdaptiveQuestion({
        interview: { jobRole: assessment.jobRole, jobDescription: assessment.jobDescription, company: "" },
        round: { name: round.name, description: `${round.description || ""}\nContinue the same interview conversation naturally. Ask a concise next question that connects to the evidence already collected, then go deeper on the most useful competency gap. Sound like a thoughtful human interviewer, not a rubric or questionnaire.` },
        state: round.adaptiveState,
        targetCompetency,
        difficulty: evaluation.policy?.difficulty || round.adaptiveState.currentDifficulty,
        sourceClaim: claim?.claim || "",
        excludeTexts: round.questions.map((question) => question.text),
    });
    round.questions.push({ text: next.text, weight: 1, competencies: next.competencies?.length ? next.competencies : [targetCompetency], knockout: false, required: false, difficulty: next.difficulty, sourceType: next.sourceType || "adaptive", sourceClaim: next.sourceClaim || "", followUps: [] });
};

export const saveAdaptiveCandidateAnswer = async (req, res, next) => {
    try {
        const assessment = await findContinuableAssessment(req.params.shareToken);
        if (!assessment) { observeCandidateAction("answer", "unavailable", null); return res.status(404).json({ message: "Assessment unavailable" }); }
        const attempt = await findAttempt(assessment._id, req.params.attemptId, req.get("x-attempt-token"));
        if (!attempt || attempt.status !== "started") { observeCandidateAction("answer", "unauthorized", assessment); return res.status(401).json({ message: "Attempt unavailable" }); }
        const { roundIndex, questionIndex, answer, spokenExplanation, followUpAnswer, diagramData } = req.body;
        const round = attempt.rounds?.[roundIndex];
        const item = round?.questions?.[questionIndex];
        if (!item) { observeCandidateAction("answer", "invalid_question", assessment); return res.status(400).json({ message: "Invalid question" }); }
        ensureFollowUpHistory(item);
        if (answer !== undefined) item.answer = answer.toString().trim().slice(0, 20000);
        if (spokenExplanation !== undefined) item.spokenExplanation = spokenExplanation.toString().trim().slice(0, 5000);
        if (diagramData !== undefined) {
            if (!isValidSystemDesignDiagram(diagramData)) return res.status(400).json({ message: "Invalid or overly complex system-design diagram" });
            item.diagramData = diagramData.slice(0, 500000);
            item.diagramSummary = summarizeSystemDesignDiagram(item.diagramData);
        }

        const conversational = round.deliveryMode === "conversational";
        if (conversational) {
            if (followUpAnswer !== undefined) {
                const pending = pendingFollowUpFor(item);
                if (!pending) return res.status(409).json({ message: "No follow-up is waiting for an answer" });
                pending.answer = followUpAnswer.toString().trim().slice(0, 5000);
                if (!pending.answer) return res.status(400).json({ message: "Follow-up answer required" });
                pending.answeredAt = new Date();
                syncLegacyFollowUpFields(item);
                const nextFollowUp = assessment.followUpsEnabled ? await decideNextAdaptiveFollowUp({ assessment, round, item }) : null;
                if (!nextFollowUp && round.adaptiveState?.enabled) await advanceAdaptiveRound({ assessment, attempt, roundIndex, questionIndex });
            } else if (item.answer) {
                const nextFollowUp = assessment.followUpsEnabled ? await decideNextAdaptiveFollowUp({ assessment, round, item }) : null;
                if (!nextFollowUp && round.adaptiveState?.enabled) await advanceAdaptiveRound({ assessment, attempt, roundIndex, questionIndex });
            }
        } else {
            if (followUpAnswer !== undefined) {
                const value = followUpAnswer.toString().trim().slice(0, 5000);
                if (!value) return res.status(400).json({ message: "Follow-up answer required" });
                const history = ensureFollowUpHistory(item);
                const pending = pendingFollowUpFor(item);
                if (pending) { pending.answer = value; pending.answeredAt = new Date(); }
                else if (item.followUpQuestion) history.push({ question: item.followUpQuestion, answer: value, answeredAt: new Date() });
                item.followUpAnswer = value;
                syncLegacyFollowUpFields(item);
            }
            if (assessment.followUpsEnabled && item.answer && !item.followUpQuestion) {
                try {
                    const decision = await generateFollowUp({ questionText: item.text, userAnswer: baseAnswer(item), jobRole: assessment.jobRole, roundName: round.name, systemDesign: round.deliveryMode === "system-design", competencies: item.competencies || [] });
                    if (decision?.shouldAsk && decision.followUp) {
                        ensureFollowUpHistory(item).push({ question: decision.followUp, answer: "", reason: decision.reason || "", focus: decision.focus || "" });
                        syncLegacyFollowUpFields(item);
                    } else {
                        item.followUpQuestion = "";
                        item.followUpAnswer = "";
                    }
                } catch { /* save the original response even if follow-up generation fails */ }
            }
        }

        await attempt.save();
        observeCandidateAction("answer", "success", assessment);
        return res.json({ attempt: publicAttempt(attempt) });
    } catch (error) { observeCandidateAction("answer", "failure", null); return next(error); }
};
