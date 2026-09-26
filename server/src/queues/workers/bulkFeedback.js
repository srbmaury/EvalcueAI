import Feedback from "../../models/Feedback.js";
import Round from "../../models/Round.js";
import Question from "../../models/Question.js";
import { generateFeedbackForAnswer } from "../../utils/generateFeedback.js";
import Interview from "../../models/Interview.js";

export default async function bulkFeedbackProcessor(job) {
    const { roundId, items = [], attach = true, userId } = job.data || {};
    const interview = userId ? await Interview.findOne({ user: userId, "rounds.round": roundId }).lean() : null;
    if (!interview) throw new Error("Round not found");
    const round = await Round.findById(roundId);
    if (!round) throw new Error("Round not found");
    const total = Array.isArray(items) ? items.length : 0;
    if (total === 0) return { count: 0, attached: 0 };

    const qIds = items.map((it) => it?.questionId).filter(Boolean);
    const allowedIds = new Set((round.questions || []).map((item) => String(item.question)));
    if (qIds.some((id) => !allowedIds.has(String(id)))) throw new Error("Question not part of round");
    const qDocs = await Question.find({ _id: { $in: qIds } });
    const byId = new Map(qDocs.map((q) => [String(q._id), q]));

    let createdCount = 0;
    let attachedCount = 0;
    for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const q = byId.get(String(it.questionId));
        if (!q) {
            await job.updateProgress(Math.round(((i + 1) / total) * 100));
            continue;
        }
        const index = Number(it.index);
        const roundItem = Number.isInteger(index) && index >= 0 && index < (round.questions?.length || 0)
            ? round.questions[index]
            : null;
        // Idempotent on BullMQ retry: a prior attempt may have already generated and
        // attached feedback for this item before the job failed partway through a later
        // item. Without this, a retry regenerates (duplicate LLM cost) and re-creates a
        // Feedback doc for every already-succeeded item, orphaning the first batch.
        if (attach && roundItem?.feedback) {
            attachedCount++;
            await job.updateProgress(Math.round(((i + 1) / total) * 100));
            continue;
        }
        const gen = await generateFeedbackForAnswer({
            questionText: q.text,
            userAnswer: (it.answer || "").toString(),
            audience: "candidate",
            evaluationContext: {
                mode: /system\s*design|architecture/i.test(round.name || "") ? "system-design" : "technical",
                jobRole: interview.jobRole,
                jobDescription: interview.jobDescription,
                roundName: round.name,
                roundDescription: round.description,
                competencies: roundItem?.competencies || [],
                sourceClaim: roundItem?.sourceClaim || "",
            },
        });
        const safeComment = (gen?.comment || "").toString().trim() || "Feedback unavailable.";
        const rawScore = Number(gen?.score);
        const clampedScore = Number.isFinite(rawScore) ? Math.min(10, Math.max(0, rawScore)) : undefined;
        const fb = await Feedback.create({
            user: userId,
            question: q._id,
            comment: safeComment,
            score: clampedScore,
            confidence: Number.isFinite(Number(gen?.confidence)) ? Math.max(0, Math.min(1, Number(gen.confidence))) : undefined,
            suggestions: Array.isArray(gen?.suggestions) ? gen.suggestions.slice(0, 10) : [],
            strengths: Array.isArray(gen?.strengths) ? gen.strengths.slice(0, 6) : [],
            gaps: Array.isArray(gen?.gaps) ? gen.gaps.slice(0, 6) : [],
            dimensions: Array.isArray(gen?.dimensions) ? gen.dimensions.slice(0, 6) : [],
            competencies: Array.isArray(gen?.competencies) ? gen.competencies.slice(0, 6) : [],
            evidence: Array.isArray(gen?.evidence) ? gen.evidence.slice(0, 8) : [],
        });
        createdCount++;
        if (attach && roundItem) {
            roundItem.feedback = fb._id;
            attachedCount++;
            // Persist immediately, not just once at the end: if a later item in this
            // loop throws, this item's attachment must not be lost/regenerated on retry.
            await round.save();
        }
        await job.updateProgress(Math.round(((i + 1) / total) * 100));
    }
    return { count: createdCount, attached: attachedCount };
}
