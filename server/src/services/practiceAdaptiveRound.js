import Question from "../models/Question.js";
import { generateFollowUp } from "../utils/generateQuestions/followUp.js";
import { getQueue } from "../queues/index.js";
import {
    applyEvidenceToState,
    chooseNextCompetency,
    compactAdaptiveState,
    evaluateAdaptiveAnswer,
    generateNextAdaptiveQuestion,
    selectResumeClaimForTarget,
    shouldStopAdaptiveRound,
} from "./adaptiveInterviewEngine.js";

// Practice adaptive rounds: follow-up decisions, evidence updates after each answer, and choosing or ending
// with the next question.
const answerWithFollowUps = (item) => {
    const original = (item?.answerGiven || "").toString().trim();
    const exchanges = (item?.followUps || [])
        .filter((followUp) => followUp?.question && followUp?.answer && !followUp?.skipped)
        .map((followUp, index) => `Follow-up ${index + 1}: ${followUp.question}\nFollow-up answer ${index + 1}: ${followUp.answer}`);
    return [original, ...exchanges].filter(Boolean).join("\n\n").trim();
};

export const pendingFollowUpFor = (item) => (item?.followUps || []).findLast?.((followUp) => followUp?.question && !followUp?.answer && !followUp?.skipped)
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

export const decideNextFollowUp = async ({ interview, round, item }) => {
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

export const createAdaptiveQuestion = async ({ interview, round, state, targetCompetency, difficulty, sourceClaim, excludeTexts }) => {
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

export const completeAdaptiveQuestion = async ({ interview, round, index, userId }) => {
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
        overallScore: evaluation.overallScore ?? undefined,
        unscored: Boolean(evaluation.unscored),
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
