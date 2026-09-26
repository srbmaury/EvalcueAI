import Interview from "../models/Interview.js";
import Round from "../models/Round.js";
import Question from "../models/Question.js";
import Feedback from "../models/Feedback.js";
import { generateClarification } from "../utils/generateQuestions/clarify.js";
import { compactAdaptiveState } from "../services/adaptiveInterviewEngine.js";
import { pendingFollowUpFor, decideNextFollowUp, completeAdaptiveQuestion } from "../services/practiceAdaptiveRound.js";
import { collectExclusionTexts, prepareConversationalRound, prepareFixedQuestions } from "../services/practiceRoundPreparation.js";

const findOwnedInterviewForRound = (userId, roundId) =>
    Interview.findOne({ user: userId, "rounds.round": roundId });

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
