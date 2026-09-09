import crypto from "crypto";
import Assessment from "../models/Assessment.js";
import CandidateAttempt from "../models/CandidateAttempt.js";

const tokenHash = (value) => crypto.createHash("sha256").update(value).digest("hex");

const hasPendingFollowUp = (question) => {
    const history = Array.isArray(question?.followUps) ? question.followUps : [];
    if (history.some((followUp) => followUp?.question && !followUp?.answer)) return true;
    return Boolean(question?.followUpQuestion && !question?.followUpAnswer);
};

export const candidateRoundComplete = (round) => {
    if (!round) return false;
    const questions = Array.isArray(round.questions) ? round.questions : [];
    if (round.deliveryMode === "system-design") return Boolean(questions[0]?.answer?.trim());
    if (round.adaptiveState?.enabled && !round.adaptiveComplete) return false;
    return questions.length > 0 && questions.every((question) => Boolean(question?.answer?.trim()) && !hasPendingFollowUp(question));
};

export const requireCandidateRoundSequence = async (req, res, next) => {
    try {
        const roundIndex = Number(req.body?.roundIndex);
        if (!Number.isInteger(roundIndex) || roundIndex <= 0) return next();

        const assessment = await Assessment.findOne({
            shareToken: req.params.shareToken,
            status: { $in: ["active", "closed"] },
            $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
        }).select("_id").lean();
        if (!assessment) return res.status(404).json({ message: "Assessment unavailable" });

        const rawToken = req.get("x-attempt-token");
        if (!rawToken) return res.status(401).json({ message: "Attempt unavailable" });
        const attempt = await CandidateAttempt.findOne({
            _id: req.params.attemptId,
            assessment: assessment._id,
            accessTokenHash: tokenHash(rawToken),
            status: "started",
        }).select("+accessTokenHash rounds");
        if (!attempt) return res.status(401).json({ message: "Attempt unavailable" });
        if (roundIndex >= attempt.rounds.length) return res.status(400).json({ message: "Invalid interview round" });

        const blocked = attempt.rounds.slice(0, roundIndex).some((round) => !candidateRoundComplete(round));
        if (blocked) return res.status(409).json({ message: "Complete the current interview round before moving ahead" });
        return next();
    } catch (error) {
        return next(error instanceof Error ? error : new Error(String(error)));
    }
};

export default requireCandidateRoundSequence;
