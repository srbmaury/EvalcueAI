import Interview from "../models/Interview.js";
import Round from "../models/Round.js";
import Question from "../models/Question.js";
import Feedback from "../models/Feedback.js";
import { generateQuestionsForRound } from "../utils/generateQuestions.js";
import { generateClarification } from "../utils/generateQuestions/clarify.js";
import { generateFollowUp } from "../utils/generateQuestions/followUp.js";
import { getQueue } from "../queues/index.js";
import {
    applyEvidenceToState,
    chooseNextCompetency,
    compactAdaptiveState,
    evaluateAdaptiveAnswer,
    generateNextAdaptiveQuestion,
    initializeAdaptiveInterviewState,
    selectResumeClaimForTarget,
    shouldStopAdaptiveRound,
} from "../services/adaptiveInterviewEngine.js";

const findOwnedInterviewForRound = (userId, roundId) =>
    Interview.findOne({ user: userId, "rounds.round": roundId });

const answerWithFollowUps = (item) => {
    const original = (item?.answerGiven || "").toString().trim();
    const exchanges = (item?.followUps || [])
        .filter((followUp) => followUp?.question && followUp?.answer && !followUp?.skipped)
        .map((followUp, index) => `Follow-up ${index + 1}: ${followUp.question}\nFollow-up answer ${index + 1}: ${followUp.answer}`);
    return [original, ...exchanges].filter(Boolean).join("\n\n").trim();
};

const pendingFollowUpFor = (item) => (item?.followUps || []).findLast?.((followUp) => followUp?.question && !followUp?.answer && !followUp?.skipped)
    || [...(item?.followUps || [])].reverse().find((followUp) => followUp?.question && !followUp?.answer && !followUp?.skipped)
    || null;

const plainAdaptiveState = (round) => {
    const state = round?.adaptiveState;
    if (!state) return {};
    return typeof state.toObject === "function" ? state.toObject() : JSON.parse(JSON.stringify(state));
};

const enqueueRoundFeedback = async ({ round, roundId, userId }) => {
    const items = (round.questions || [])
        .map((item, index) => ({
            index,
            questionId: item?.question?._id || item?.question,
            answer: answerWithFollowUps(item),
            hasFeedback: Boolean(item?.feedback),
        }))
        .filter((item) => item.questionId && item.answer && !item.hasFeedback)
        .map(({ index, questionId, answer }) => ({ index, questionId, answer }));
    if (!items.length) return null;
    try {
        const queue = await getQueue("bulk-feedback");
        if (!queue) return null;
        const job = await queue.add("bulk-feedback", { roundId, items, attach: true, userId: String(userId) }, {
            removeOnComplete: { age: 3600, count: 500 },
            removeOnFail: { age: 86400, count: 500 },
        });
        return job?.id || null;
    } catch (error) {
        console.warn("enqueue bulk-feedback after conversational completion failed", error?.message || error);
        return null;
    }
};

const decideNextFollowUp = async ({ interview, round, item }) => {
    const existingPending = pendingFollowUpFor(item);
    if (existingPending) {
        return { question: existingPending.question, number: item.followUps.length, remaining: Math.max(0, 3 - item.followUps.length) };
    }
    const decision = await generateFollowUp({
        questionText: item?.question?.text || "",
        userAnswer: (item?.answerGiven || "").toString().trim(),
        followUps: item?.followUps || [],
        jobRole: interview?.jobRole || "",
        roundName: round?.name || "",
        systemDesign: /system\s*design|architecture/i.test(round?.name || ""),
        competencies: item?.competencies || [],
        sourceClaim: item?.sourceClaim || "",
        candidateBackground: interview?.candidateIntro || "",
    });
    if (!decision?.shouldAsk || !decision?.followUp) return null;
    item.followUps.push({
        question: decision.followUp,
        reason: decision.reason || "",
        focus: decision.focus || "",
    });
    return { question: decision.followUp, number: item.followUps.length, remaining: Math.max(0, 3 - item.followUps.length) };
};

const createAdaptiveQuestion = async ({ interview, round, state, targetCompetency, difficulty, sourceClaim, excludeTexts }) => {
    const spec = await generateNextAdaptiveQuestion({
        interview,
        round,
        state,
        targetCompetency,
        difficulty,
        sourceClaim,
        excludeTexts,
    });
    if (!spec?.text) return null;
    const question = await Question.create({ text: spec.text, tags: spec.tags || [] });
    return {
        question: question._id,
        difficulty: spec.difficulty,
        competencies: spec.competencies || [],
        sourceType: spec.sourceType || "adaptive",
        sourceClaim: spec.sourceClaim || "",
        followUps: [],
    };
};

const completeAdaptiveQuestion = async ({ interview, round, index, userId }) => {
    const item = round.questions[index];
    const answer = answerWithFollowUps(item);
    const stateBefore = plainAdaptiveState(round);
    const evaluation = await evaluateAdaptiveAnswer({
        questionText: item?.question?.text || "",
        answerText: answer,
        targetedCompetencies: item?.competencies || [],
        sourceClaim: item?.sourceClaim || "",
        state: stateBefore,
        jobRole: interview?.jobRole || "",
        roundName: round?.name || "",
    });

    item.quickEvaluation = {
        overallScore: evaluation.overallScore,
        confidence: evaluation.confidence,
        dimensions: evaluation.dimensions,
        competencyEvidence: evaluation.competencyEvidence,
        strengths: evaluation.strengths,
        gaps: evaluation.gaps,
        evaluatedAt: new Date(),
    };

    const nextState = applyEvidenceToState(stateBefore, evaluation, {
        questionIndex: index,
        targetedCompetencies: item?.competencies || [],
        sourceClaim: item?.sourceClaim || "",
    });
    round.adaptiveState = nextState;

    const stopDecision = shouldStopAdaptiveRound(nextState, evaluation);
    if (stopDecision.stop) {
        round.status = "completed";
        round.conversationalIndex = round.questions.length;
        round.adaptiveState.completedReason = stopDecision.reason;
        round.adaptiveState.lastDecision.action = "end-round";
        round.adaptiveState.lastDecision.reason = stopDecision.reason;
        round.adaptiveState.updatedAt = new Date();
        await round.save();
        const feedbackJobId = await enqueueRoundFeedback({ round, roundId: round._id, userId });
        return {
            done: true,
            nextIndex: round.conversationalIndex,
            feedbackJobId,
            adaptive: compactAdaptiveState(round.adaptiveState),
        };
    }

    const knownNames = new Set((nextState.competencies || []).map((entry) => (entry.name || "").toLowerCase()));
    const requestedTarget = (evaluation?.policy?.targetCompetency || "").toString().trim();
    const targetCompetency = knownNames.has(requestedTarget.toLowerCase()) ? requestedTarget : chooseNextCompetency(nextState);
    const claim = selectResumeClaimForTarget(nextState, targetCompetency, evaluation?.policy?.sourceClaim || "");
    const excludeTexts = (round.questions || []).map((entry) => entry?.question?.text).filter(Boolean);
    let nextQuestion;
    try {
        nextQuestion = await createAdaptiveQuestion({
            interview,
            round,
            state: nextState,
            targetCompetency,
            difficulty: nextState.currentDifficulty,
            sourceClaim: claim?.claim || "",
            excludeTexts,
        });
    } catch (error) {
        console.warn("adaptive next-question generation failed", error?.message || error);
    }

    if (!nextQuestion) {
        if ((Number(nextState.questionsAsked) || 0) >= (Number(nextState.minQuestions) || 2)) {
            round.status = "completed";
            round.conversationalIndex = round.questions.length;
            round.adaptiveState.completedReason = "The round ended after sufficient evidence because another distinct question could not be generated safely.";
            round.adaptiveState.lastDecision.action = "end-round";
            round.adaptiveState.lastDecision.reason = round.adaptiveState.completedReason;
            await round.save();
            const feedbackJobId = await enqueueRoundFeedback({ round, roundId: round._id, userId });
            return { done: true, nextIndex: round.conversationalIndex, feedbackJobId, adaptive: compactAdaptiveState(round.adaptiveState) };
        }
        throw new Error("Could not generate the next adaptive question");
    }

    round.questions.push(nextQuestion);
    round.conversationalIndex = round.questions.length - 1;
    round.status = "in_progress";
    round.adaptiveState.lastDecision.action = "next-question";
    round.adaptiveState.lastDecision.targetCompetency = targetCompetency;
    round.adaptiveState.lastDecision.sourceClaim = claim?.claim || "";
    round.adaptiveState.lastDecision.difficulty = nextQuestion.difficulty;
    round.adaptiveState.updatedAt = new Date();
    await round.save();
    return {
        done: false,
        nextIndex: round.conversationalIndex,
        feedbackJobId: null,
        adaptive: compactAdaptiveState(round.adaptiveState),
    };
};

const collectExclusionTexts = async (interview) => {
    const allRoundIds = interview.rounds.map((r) => r.round);
    const allRounds = await Round.find({ _id: { $in: allRoundIds } }).populate({ path: "questions.question", select: "text" });
    return allRounds.flatMap((r) => (r?.questions || []).map((q) => q?.question?.text).filter(Boolean));
};

const prepareConversationalRound = async ({ interview, round, limit, prefetch, exclusionTexts }) => {
    if ((round.questions || []).length > 0) {
        if (!prefetch && round.status === "pending") {
            round.status = "in_progress";
            round.conversationalIndex = Math.min(Number(round.conversationalIndex) || 0, Math.max(0, round.questions.length - 1));
            await round.save();
        }
        return Round.findById(round._id).populate("questions.question");
    }

    const state = await initializeAdaptiveInterviewState({
        jobRole: interview.jobRole,
        jobDescription: interview.jobDescription,
        roundName: round.name,
        roundDescription: round.description,
        skills: round.skills || [],
        resumeText: interview?.resume?.extractedText || "",
        maxQuestions: limit,
    });
    const target = chooseNextCompetency(state);
    const claim = selectResumeClaimForTarget(state, target);
    const first = await createAdaptiveQuestion({
        interview,
        round,
        state,
        targetCompetency: target,
        difficulty: state.currentDifficulty,
        sourceClaim: claim?.claim || "",
        excludeTexts: exclusionTexts,
    });
    if (!first) throw new Error("Failed to generate the first adaptive question");

    round.questionLimit = limit;
    round.adaptiveState = state;
    round.adaptiveState.lastDecision = {
        action: "next-question",
        targetCompetency: target,
        sourceClaim: claim?.claim || "",
        reason: "Initial question selected from the round evidence plan.",
        confidence: 1,
        difficulty: first.difficulty,
        decidedAt: new Date(),
    };
    round.questions = [first];
    round.conversationalIndex = 0;
    if (!prefetch) round.status = "in_progress";
    await round.save();
    return Round.findById(round._id).populate("questions.question");
};

const prepareFixedQuestions = async ({ interview, round, limit, prefetch, exclusionTexts }) => {
    // Mirrors prepareConversationalRound's guard: a retried/duplicate prepare call (the
    // direct route has no idempotency protection, and the queued job can be re-triggered)
    // must reuse an already-prepared round instead of discarding answered questions and
    // their feedback and silently un-completing the round.
    if ((round.questions || []).length > 0) {
        if (!prefetch && round.status === "pending") {
            round.status = "in_progress";
            round.conversationalIndex = 0;
            await round.save();
        }
        return Round.findById(round._id).populate("questions.question");
    }
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let qTexts = [];
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const generated = await generateQuestionsForRound({
                company: interview.company,
                jobRole: interview.jobRole,
                jobDescription: interview.jobDescription,
                resumeText: interview?.resume?.extractedText,
                roundName: round.name,
                roundDescription: round.description,
                deliveryMode: round.deliveryMode,
                count: limit,
                excludeTexts: exclusionTexts,
                grounding: interview.grounding,
            });
            if (Array.isArray(generated) && generated.length > 0) {
                qTexts = generated;
                break;
            }
            lastErr = new Error("Empty question list from generator");
        } catch (error) {
            lastErr = error;
        }
        if (attempt < 2) await sleep(400 * (attempt + 1));
    }

    if (!qTexts.length) {
        const tags = [interview.company, interview.jobRole, round.name, round.description]
            .map((value) => (value || "").toString().toLowerCase().trim())
            .filter((value) => value.length >= 2)
            .slice(0, 10);
        let fallback = tags.length ? await Question.find({ tags: { $in: tags } }).sort({ createdAt: -1 }).limit(limit).lean() : [];
        if (!fallback.length) {
            const recent = await Question.find({}).sort({ createdAt: -1 }).limit(limit * 3).lean();
            const seen = new Set(exclusionTexts.map((text) => (text || "").toLowerCase().trim().slice(0, 200)));
            fallback = recent.filter((q) => q?.text && !seen.has(q.text.toLowerCase().trim().slice(0, 200))).slice(0, limit);
        }
        if (!fallback.length) throw lastErr || new Error("Failed to generate questions");
        round.questions = fallback.map((q) => ({ question: q._id, sourceType: "fallback" }));
        round.questionLimit = round.questions.length;
    } else {
        const normalized = qTexts.map((q) => typeof q === "string"
            ? { text: q, tags: [] }
            : { text: String(q?.text || "").slice(0, 500), tags: Array.isArray(q?.tags) ? q.tags.slice(0, 10) : [] });
        const created = await Question.insertMany(normalized.map(({ text, tags }) => ({ text, tags })));
        round.questions = created.map((q) => ({ question: q._id, sourceType: "planned" }));
        round.questionLimit = round.questions.length;
    }
    if (!prefetch) {
        round.status = "in_progress";
        round.conversationalIndex = 0;
    }
    await round.save();
    return Round.findById(round._id).populate("questions.question");
};

export const prepareQuestionsForRound = async (req, res, next) => {
    try {
        const { interviewId, roundId } = req.params;
        const { count = 5, prefetch = false } = req.body || {};
        const interview = await Interview.findOne({ _id: interviewId, user: req.user._id }).populate("resume");
        if (!interview) return res.status(404).json({ message: "Interview not found" });
        const round = await Round.findById(roundId);
        if (!round) return res.status(404).json({ message: "Round not found" });

        const order = interview.rounds.map((r) => String(r.round));
        const idx = order.indexOf(String(round._id));
        if (idx === -1) return res.status(400).json({ message: "Round not part of interview" });
        if (!prefetch) {
            const allRoundDocs = await Round.find({ _id: { $in: order } }).select("_id status");
            const statusById = new Map(allRoundDocs.map((r) => [String(r._id), r.status]));
            for (let i = 0; i < idx; i++) {
                if (statusById.get(order[i]) !== "completed") return res.status(400).json({ message: "Previous round not completed" });
            }
        }

        if (prefetch && (round.questions || []).length > 0) {
            return res.json(await Round.findById(roundId).populate("questions.question"));
        }

        const limit = Math.min(Math.max(Number(count) || Number(round.questionLimit) || 5, 1), 20);
        const exclusionTexts = await collectExclusionTexts(interview);
        const prepared = round.deliveryMode === "conversational"
            ? await prepareConversationalRound({ interview, round, limit, prefetch, exclusionTexts })
            : await prepareFixedQuestions({ interview, round, limit, prefetch, exclusionTexts });
        return res.json(prepared);
    } catch (error) {
        console.error("prepareQuestionsForRound error:", error);
        return next(error instanceof Error ? error : new Error(String(error)));
    }
};

export const submitConversationalAnswer = async (req, res, next) => {
    try {
        const { roundId } = req.params;
        const { index, answer } = req.body || {};
        const interview = await findOwnedInterviewForRound(req.user._id, roundId).populate("resume").lean();
        if (!interview) return res.status(404).json({ message: "Round not found" });
        const round = await Round.findById(roundId).populate("questions.question");
        if (!round) return res.status(404).json({ message: "Round not found" });
        if (round.deliveryMode !== "conversational") return res.status(400).json({ message: "Round is not conversational" });

        const idx = Number(index);
        const currentIndex = Number(round.conversationalIndex) || 0;
        if (!Number.isInteger(idx) || idx < 0 || idx >= round.questions.length) return res.status(400).json({ message: "Invalid index" });
        if (idx < currentIndex || round.status === "completed") {
            return res.json({ success: true, replayed: true, done: round.status === "completed", nextIndex: currentIndex, followUp: null, adaptive: compactAdaptiveState(round.adaptiveState) });
        }
        if (idx !== currentIndex) return res.status(409).json({ message: "Answer the current question before moving ahead" });

        const item = round.questions[idx];
        const pending = pendingFollowUpFor(item);
        if (pending) {
            return res.json({ success: true, done: false, nextIndex: idx, followUp: pending.question, followUpNumber: item.followUps.length, remainingFollowUps: Math.max(0, 3 - item.followUps.length), adaptive: compactAdaptiveState(round.adaptiveState) });
        }

        item.answerGiven = (answer || "").toString().slice(0, 5000);
        await round.save();
        const nextFollowUp = await decideNextFollowUp({ interview, round, item });
        if (nextFollowUp) {
            await round.save();
            return res.json({ success: true, done: false, nextIndex: idx, followUp: nextFollowUp.question, followUpNumber: nextFollowUp.number, remainingFollowUps: nextFollowUp.remaining, adaptive: compactAdaptiveState(round.adaptiveState) });
        }

        const result = await completeAdaptiveQuestion({ interview, round, index: idx, userId: req.user._id });
        return res.json({ success: true, followUp: null, ...result });
    } catch (error) {
        console.error("submitConversationalAnswer error:", error);
        return next(error instanceof Error ? error : new Error(String(error)));
    }
};

export const submitOAAnswers = async (req, res, next) => {
    try {
        const { roundId } = req.params;
        const { answers } = req.body || {};
        const ownedInterview = await findOwnedInterviewForRound(req.user._id, roundId).lean();
        if (!ownedInterview) return res.status(404).json({ message: "Round not found" });
        const round = await Round.findById(roundId).populate("questions.question");
        if (!round) return res.status(404).json({ message: "Round not found" });
        if (round.deliveryMode !== "online-assessment") return res.status(400).json({ message: "Round is not OA" });
        if (!Array.isArray(answers)) return res.status(400).json({ message: "Invalid answers" });
        // Matches submitConversationalAnswer's guard: once feedback has been generated for
        // a completed round, a late/retried autosave must not silently rewrite answers out
        // from under it, leaving stored feedback inconsistent with the stored answer.
        if (round.status === "completed") return res.json({ success: true, replayed: true });

        const limit = Math.min(round.questions.length, round.questionLimit);
        for (let i = 0; i < limit; i++) {
            if (!round.questions[i]) break;
            round.questions[i].answerGiven = (answers[i] || "").toString().slice(0, 5000);
        }
        await round.save();
        return res.json({ success: true });
    } catch (error) {
        console.error("submitOAAnswers error:", error);
        return next(error instanceof Error ? error : new Error(String(error)));
    }
};

export const completeRound = async (req, res, next) => {
    try {
        const { roundId } = req.params;
        const ownedInterview = await findOwnedInterviewForRound(req.user._id, roundId).lean();
        if (!ownedInterview) return res.status(404).json({ message: "Round not found" });
        const round = await Round.findById(roundId);
        if (!round) return res.status(404).json({ message: "Round not found" });
        round.status = "completed";
        if (round.adaptiveState?.enabled) {
            round.adaptiveState.completedReason = round.adaptiveState.completedReason || "You ended the round early.";
            round.adaptiveState.lastDecision.action = "end-round";
            round.adaptiveState.lastDecision.reason = round.adaptiveState.completedReason;
        }
        await round.save();
        return res.json({ success: true });
    } catch (error) {
        console.error("completeRound error:", error);
        return next(error instanceof Error ? error : new Error(String(error)));
    }
};

export const skipRound = async (req, res, next) => {
    try {
        const { interviewId, roundId } = req.params;
        const interview = await Interview.findOne({ _id: interviewId, user: req.user._id });
        if (!interview) return res.status(404).json({ message: "Interview not found" });
        if (!interview.rounds.some((r) => String(r.round) === String(roundId))) return res.status(400).json({ message: "Round not part of interview" });

        const round = await Round.findById(roundId);
        if (!round) return res.status(404).json({ message: "Round not found" });
        if (round.status === "completed") return res.status(400).json({ message: "Cannot skip a completed round" });

        const qIds = (round.questions || []).map((q) => q?.question).filter(Boolean);
        if (qIds.length > 0) {
            const feedbackIds = (round.questions || []).map((q) => q?.feedback).filter(Boolean);
            await Feedback.deleteMany({ _id: { $in: feedbackIds } });
            const sharedQuestionIds = await Round.distinct("questions.question", { _id: { $ne: round._id }, "questions.question": { $in: qIds } });
            const shared = new Set(sharedQuestionIds.map(String));
            await Question.deleteMany({ _id: { $in: qIds.filter((id) => !shared.has(String(id))) } });
        }
        await Interview.updateOne({ _id: interviewId, user: req.user._id }, { $pull: { rounds: { round: roundId } } });
        await Round.deleteOne({ _id: roundId });
        return res.json({ success: true });
    } catch (error) {
        console.error("skipRound error:", error);
        return next(error instanceof Error ? error : new Error(String(error)));
    }
};

export const submitFollowUpAnswer = async (req, res, next) => {
    try {
        const { roundId } = req.params;
        const { index, answer, skip = false } = req.body || {};
        const interview = await findOwnedInterviewForRound(req.user._id, roundId).populate("resume").lean();
        if (!interview) return res.status(404).json({ message: "Round not found" });
        const round = await Round.findById(roundId).populate("questions.question");
        if (!round || round.deliveryMode !== "conversational") return res.status(400).json({ message: "Invalid follow-up" });

        const idx = Number(index);
        if (!Number.isInteger(idx) || idx < 0 || idx >= round.questions.length) return res.status(400).json({ message: "Invalid follow-up" });
        if ((Number(round.conversationalIndex) || 0) !== idx) return res.status(409).json({ message: "This follow-up is no longer active" });
        const item = round.questions[idx];
        const pending = pendingFollowUpFor(item);
        if (!pending) return res.status(409).json({ message: "No follow-up is waiting for an answer" });

        if (skip) {
            pending.skipped = true;
            pending.answeredAt = new Date();
        } else {
            pending.answer = (answer || "").toString().trim().slice(0, 5000);
            if (!pending.answer) return res.status(400).json({ message: "Follow-up answer required" });
            pending.answeredAt = new Date();
        }
        await round.save();

        if (!skip) {
            const nextFollowUp = await decideNextFollowUp({ interview, round, item });
            if (nextFollowUp) {
                await round.save();
                return res.json({ success: true, done: false, nextIndex: idx, followUp: nextFollowUp.question, followUpNumber: nextFollowUp.number, remainingFollowUps: nextFollowUp.remaining, adaptive: compactAdaptiveState(round.adaptiveState) });
            }
        }

        const result = await completeAdaptiveQuestion({ interview, round, index: idx, userId: req.user._id });
        return res.json({ success: true, followUp: null, ...result });
    } catch (error) {
        return next(error instanceof Error ? error : new Error(String(error)));
    }
};

export const clarifyCurrentQuestion = async (req, res, next) => {
    try {
        const { roundId } = req.params;
        const { message } = req.body || {};
        if (!message || !message.toString().trim()) return res.status(400).json({ message: "Message required" });
        const interview = await findOwnedInterviewForRound(req.user._id, roundId).lean();
        if (!interview) return res.status(404).json({ message: "Round not found" });
        const round = await Round.findById(roundId).populate("questions.question");
        if (!round) return res.status(404).json({ message: "Round not found" });
        if (round.deliveryMode !== "conversational") return res.status(400).json({ message: "Round is not conversational" });
        const idx = Number(round.conversationalIndex) || 0;
        const current = round.questions?.[idx] || round.questions?.[idx - 1] || round.questions?.[0];
        const answer = await generateClarification({
            questionText: current?.question?.text || "",
            userMessage: message,
            jobRole: interview?.jobRole || "",
            roundName: round.name,
        });
        return res.json({ answer });
    } catch (error) {
        console.error("clarifyCurrentQuestion error:", error);
        return next(error instanceof Error ? error : new Error(String(error)));
    }
};
