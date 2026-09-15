import Feedback from "../models/Feedback.js";
import Round from "../models/Round.js";
import Question from "../models/Question.js";
import { generateFeedbackForAnswer } from "../utils/generateFeedback.js";
import Interview from "../models/Interview.js";

const ownedRoundIds = async (userId) => {
    const interviews = await Interview.find({ user: userId }).select("rounds.round").lean();
    return interviews.flatMap((interview) => (interview.rounds || []).map((item) => item.round));
};

const userOwnsRound = async (userId, roundId) =>
    Boolean(await Interview.exists({ user: userId, "rounds.round": roundId }));

const userOwnsQuestion = async (userId, questionId) => {
    const roundIds = await ownedRoundIds(userId);
    return Boolean(roundIds.length && await Round.exists({ _id: { $in: roundIds }, "questions.question": questionId }));
};

// Create feedback for a specific question (by questionId)
export const createFeedback = async (req, res, next) => {
    try {
        const { questionId } = req.params;
        const { answer } = req.body || {};
        if (!await userOwnsQuestion(req.user._id, questionId)) {
            return res.status(404).json({ message: "Question not found" });
        }
        const qDoc = await Question.findById(questionId);
        if (!qDoc) return res.status(404).json({ message: "Question not found" });
        const gen = await generateFeedbackForAnswer({ questionText: qDoc.text, userAnswer: answer });
        const safeComment = (gen?.comment || "").toString().trim() || "Feedback unavailable.";
        const rawScore = Number(gen?.score);
        const clampedScore = Number.isFinite(rawScore) ? Math.min(10, Math.max(0, rawScore)) : undefined;
        const safeSuggestions = Array.isArray(gen?.suggestions)
            ? gen.suggestions.map((s) => (s || "").toString()).filter(Boolean).slice(0, 10)
            : [];
        const fb = await Feedback.create({
            user: req.user._id,
            question: questionId,
            comment: safeComment,
            score: clampedScore,
            suggestions: safeSuggestions,
        });
        return res.status(201).json(fb);
    } catch (error) {
        console.error("createFeedback error:", error);
        return next(error instanceof Error ? error : new Error(String(error)));
    }
};

// Attach feedback to a question inside a round (by roundId and index)
export const attachFeedbackToRoundQuestion = async (req, res, next) => {
    try {
        const { roundId } = req.params;
        const { index, feedbackId } = req.body || {};
        if (!await userOwnsRound(req.user._id, roundId)) {
            return res.status(404).json({ message: "Round not found" });
        }
        const round = await Round.findById(roundId);
        if (!round) return res.status(404).json({ message: "Round not found" });
        const idx = Number(index);
        if (!Number.isInteger(idx) || idx < 0 || idx >= (round.questions?.length || 0))
            return res.status(400).json({ message: "Invalid index" });
        const feedback = await Feedback.findOne({
            _id: feedbackId,
            user: req.user._id,
            question: round.questions[idx].question,
        });
        if (!feedback) return res.status(404).json({ message: "Feedback not found" });
        round.questions[idx].feedback = feedbackId;
        await round.save();
        return res.json({ success: true });
    } catch (error) {
        console.error("attachFeedbackToRoundQuestion error:", error);
        return next(error instanceof Error ? error : new Error(String(error)));
    }
};

// Get feedback list for a question
export const getFeedbackForQuestion = async (req, res, next) => {
    try {
        const { questionId } = req.params;
        if (!await userOwnsQuestion(req.user._id, questionId)) {
            return res.status(404).json({ message: "Question not found" });
        }
        const list = await Feedback.find({ question: questionId, user: req.user._id }).sort({ createdAt: -1 });
        return res.json(list);
    } catch (error) {
        console.error("getFeedbackForQuestion error:", error);
        return next(error instanceof Error ? error : new Error(String(error)));
    }
};

// Bulk feedback for OA rounds: accepts array of { questionId, answer }
export const createBulkFeedback = async (req, res, next) => {
    try {
        const { items } = req.body || {};
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ message: "No items provided" });
        }
        const qIds = items.map((it) => it?.questionId).filter(Boolean);
        const roundIds = await ownedRoundIds(req.user._id);
        const ownedRounds = await Round.find({ _id: { $in: roundIds }, "questions.question": { $in: qIds } }).select("questions.question").lean();
        const allowedQuestionIds = new Set(ownedRounds.flatMap((round) => (round.questions || []).map((item) => String(item.question))));
        const qDocs = await Question.find({ _id: { $in: qIds.filter((id) => allowedQuestionIds.has(String(id))) } });
        const byId = new Map(qDocs.map((q) => [String(q._id), q]));

        const results = [];
        const failures = [];
        for (const it of items) {
            const q = byId.get(String(it.questionId));
            if (!q) continue;
            // One item's AI failure must not discard the HTTP response (and the DB writes
            // already made for earlier items in this same batch) for the whole request —
            // report it and continue, instead of throwing out of the loop.
            try {
                const gen = await generateFeedbackForAnswer({ questionText: q.text, userAnswer: it.answer });
                const safeComment = (gen?.comment || "").toString().trim() || "Feedback unavailable.";
                const rawScore = Number(gen?.score);
                const clampedScore = Number.isFinite(rawScore) ? Math.min(10, Math.max(0, rawScore)) : undefined;
                const safeSuggestions = Array.isArray(gen?.suggestions)
                    ? gen.suggestions.map((s) => (s || "").toString()).filter(Boolean).slice(0, 10)
                    : [];
                const fb = await Feedback.create({
                    user: req.user._id,
                    question: q._id,
                    comment: safeComment,
                    score: clampedScore,
                    suggestions: safeSuggestions,
                });
                results.push(fb);
            } catch (error) {
                console.error("createBulkFeedback item failed:", q._id, error?.message || error);
                failures.push({ questionId: q._id });
            }
        }
        return res.status(201).json({ count: results.length, feedback: results, failed: failures });
    } catch (error) {
        console.error("createBulkFeedback error:", error);
        return next(error instanceof Error ? error : new Error(String(error)));
    }
};
