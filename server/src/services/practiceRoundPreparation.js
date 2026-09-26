import Round from "../models/Round.js";
import Question from "../models/Question.js";
import { generateQuestionsForRound } from "../utils/generateQuestions.js";
import { chooseNextCompetency, initializeAdaptiveInterviewState, selectResumeClaimForTarget } from "./adaptiveInterviewEngine.js";
import { createAdaptiveQuestion } from "./practiceAdaptiveRound.js";

// Question preparation for Practice rounds: adaptive conversational rounds and fixed question sets.
export const collectExclusionTexts = async (interview) => {
    const allRoundIds = interview.rounds.map((r) => r.round);
    const allRounds = await Round.find({ _id: { $in: allRoundIds } }).populate({ path: "questions.question", select: "text" });
    return allRounds.flatMap((r) => (r?.questions || []).map((q) => q?.question?.text).filter(Boolean));
};

export const prepareConversationalRound = async ({ interview, round, limit, prefetch, exclusionTexts }) => {
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

export const prepareFixedQuestions = async ({ interview, round, limit, prefetch, exclusionTexts }) => {
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
