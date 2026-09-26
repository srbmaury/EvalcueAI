import CandidateAttempt from "../../models/CandidateAttempt.js";
import { FEEDBACK_ENGINE_VERSION, FEEDBACK_PROMPT_VERSION, generateFeedbackForAnswer } from "../../utils/generateFeedback.js";
import metrics from "../../metrics/index.js";
import productionMetrics from "../../metrics/production.js";
import Assessment from "../../models/Assessment.js";
import { summarizeSystemDesignDiagram } from "../../utils/systemDesignDiagram.js";
import { buildCandidateEvaluationEvidence } from "../../services/candidateEvaluationEvidence.js";

export default async function candidateAssessmentProcessor(job) {
    const attempt = await CandidateAttempt.findOne({ _id: job.data?.attemptId, status: "evaluating" });
    if (!attempt) return { skipped: true };

    productionMetrics.assessmentEvaluationsInFlight.inc();
    let terminalOutcome = "";
    let terminalAt = null;
    try {
        const assessment = await Assessment.findById(attempt.assessment).lean();
        const items = attempt.rounds.flatMap((round) => round.questions);
        let completed = 0;
        const allScores = []; let weightedTotal = 0; let totalWeight = 0;
        for (const [roundIndex, round] of attempt.rounds.entries()) {
            const roundScores = [];
            // Code-fix debugging rounds have an objective signal (hidden tests); score mostly from it and let the
            // AI judge the actual code changes rather than a one-line "Tests: x/y" summary.
            const debugResponse = round.deliveryMode === "debugging"
                ? (attempt.debuggingResponses || []).find((response) => Number(response.roundIndex) === roundIndex)
                : null;
            const testTotal = Number(debugResponse?.finalEvaluation?.total) || 0;
            const testPassed = Number(debugResponse?.finalEvaluation?.passed) || 0;
            const codeChanges = [...(debugResponse?.changedFiles || []), ...(debugResponse?.createdFiles || [])]
                .slice(0, 6).map((file) => `--- ${file.path}\n${String(file.content || "").slice(0, 3000)}`).join("\n\n");
            for (const item of round.questions) {
                const diagramContext = item.diagramSummary || (item.diagramData ? summarizeSystemDesignDiagram(item.diagramData) : "");
                if (diagramContext) item.diagramSummary = diagramContext;
                const systemDesign = round.deliveryMode === "system-design";
                let combined = buildCandidateEvaluationEvidence({ item, systemDesign, diagramContext });
                if (testTotal > 0) combined = `${combined}\n\nHidden recruiter tests: ${testPassed}/${testTotal} passed.${codeChanges ? `\nCandidate's code changes:\n${codeChanges}` : ""}\nJudge correctness mainly from the test result; use the code to judge root-cause understanding and quality.`;
                const feedback = await generateFeedbackForAnswer({ questionText: item.text, userAnswer: combined, evaluationContext: systemDesign ? { mode: "system-design", jobRole: assessment?.jobRole, jobDescription: assessment?.jobDescription, roundDescription: round.description, rubric: assessment?.rubric } : undefined });
                if (testTotal > 0) {
                    const aiScore = Number(feedback.score) || 0;
                    feedback.score = Math.round(((testPassed / testTotal) * 10 * 0.7 + aiScore * 0.3) * 10) / 10;
                    feedback.comment = `Hidden tests: ${testPassed}/${testTotal} passed. ${feedback.comment || ""}`.trim();
                }
                item.feedbackComment = feedback.comment; item.suggestions = feedback.suggestions; item.score = feedback.score;
                roundScores.push(feedback.score); allScores.push(feedback.score);
                const weight = Number(item.weight) || 1; weightedTotal += feedback.score * weight; totalWeight += weight;
                completed += 1; await job.updateProgress?.(Math.round(completed / items.length * 100));
            }
            round.score = roundScores.length ? Math.round((roundScores.reduce((a, b) => a + b, 0) / roundScores.length) * 10) / 10 : 0;
        }
        attempt.overallScore = totalWeight ? Math.round((weightedTotal / totalWeight) * 10) / 10 : 0;
        attempt.status = "submitted";
        attempt.submittedAt = new Date();
        attempt.evaluationError = "";
        attempt.evaluationMetadata = {
            engineVersion: FEEDBACK_ENGINE_VERSION,
            promptVersion: FEEDBACK_PROMPT_VERSION,
            questionCount: completed,
            completedAt: attempt.submittedAt,
        };
        await attempt.save();
        await Assessment.updateOne({ _id: attempt.assessment, "invitations.email": attempt.candidateEmail }, { $set: { "invitations.$.status": "completed" } });
        try { metrics.candidateAssessmentCompletionDurationSeconds.observe(Math.max((attempt.submittedAt.getTime() - attempt.startedAt.getTime()) / 1000, 0)); } catch {}
        terminalOutcome = "success";
        terminalAt = attempt.submittedAt;
        return { submitted: true, score: attempt.overallScore };
    } catch (error) {
        const finalAttempt = Number(job.attemptsMade || 0) + 1 >= Number(job.opts?.attempts || 1);
        if (finalAttempt) {
            terminalOutcome = "failure";
            terminalAt = new Date();
            await CandidateAttempt.updateOne({ _id: attempt._id, status: "evaluating" }, { $set: { status: "evaluation_failed", evaluationError: (error?.message || "Evaluation failed").slice(0, 500) } });
        }
        throw error;
    } finally {
        productionMetrics.assessmentEvaluationsInFlight.dec();
        if (terminalOutcome && terminalAt && attempt.evaluationStartedAt) {
            productionMetrics.assessmentEvaluationDurationSeconds
                .labels(terminalOutcome)
                .observe(Math.max(0, (terminalAt.getTime() - attempt.evaluationStartedAt.getTime()) / 1000));
        }
    }
}
