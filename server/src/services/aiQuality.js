import mongoose from "mongoose";
import AiQualityCounter from "../models/AiQualityCounter.js";

const startOfUtcDay = (date = new Date()) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

// Best effort: quality accounting must never slow down or fail an interview.
export const recordAiQualityEvent = (stage, signal, outcome) => {
    if (mongoose.connection.readyState !== 1) return;
    AiQualityCounter.updateOne(
        { day: startOfUtcDay(), stage, signal, outcome },
        { $inc: { count: 1 } },
        { upsert: true },
    ).catch(() => {});
};

const sum = (rows, predicate) => rows.filter(predicate).reduce((total, row) => total + row.count, 0);
const rate = (numerator, denominator) => (denominator ? Math.round((numerator / denominator) * 1000) / 10 : null);

// Rates are percentages (one decimal) over the window; null when there is no denominator yet.
export const summarizeAiQuality = (rows = []) => {
    const is = (stage, signal, outcome) => (row) => row.stage === stage && (!signal || row.signal === signal) && (!outcome || row.outcome === outcome);
    const followUpDecisions = sum(rows, is("followup", "decision"));
    // A guard intervenes once per draft: invented specifics trigger a retry (which may then be suppressed),
    // repeats are suppressed directly.
    const followUpGuards = sum(rows, is("followup", "invented_specifics", "retried")) + sum(rows, is("followup", "repeat", "suppressed"));
    const followUpSuppressed = sum(rows, is("followup", "invented_specifics", "suppressed")) + sum(rows, is("followup", "repeat", "suppressed"));
    const nextQuestions = sum(rows, is("next_question", "source"));
    const adaptiveEvaluations = sum(rows, is("adaptive_evaluation", "result"));
    const feedbackEvaluations = sum(rows, is("feedback_evaluation", "result"));
    return {
        rates: {
            followUpGuardInterventions: rate(followUpGuards, followUpDecisions),
            followUpSuppressed: rate(followUpSuppressed, followUpDecisions),
            followUpProviderUnavailable: rate(sum(rows, is("followup", "decision", "provider_unavailable")), followUpDecisions),
            nextQuestionFallback: rate(sum(rows, (row) => row.stage === "next_question" && row.signal === "source" && row.outcome !== "ai"), nextQuestions),
            adaptiveUnscored: rate(sum(rows, is("adaptive_evaluation", "result", "unscored")), adaptiveEvaluations),
            feedbackFailed: rate(sum(rows, is("feedback_evaluation", "result", "failed")), feedbackEvaluations),
        },
        volume: { followUpDecisions, nextQuestions, adaptiveEvaluations, feedbackEvaluations },
    };
};

export const getAiQualitySummary = async ({ days = 30 } = {}) => {
    const since = startOfUtcDay(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000));
    const rows = await AiQualityCounter.find({ day: { $gte: since } }).select("-_id day stage signal outcome count").lean();
    const totals = new Map();
    for (const row of rows) {
        const key = `${row.stage}|${row.signal}|${row.outcome}`;
        totals.set(key, (totals.get(key) || 0) + row.count);
    }
    const byDay = new Map();
    for (const row of rows) {
        const day = row.day.toISOString().slice(0, 10);
        byDay.set(day, [...(byDay.get(day) || []), row]);
    }
    return {
        days,
        since: since.toISOString().slice(0, 10),
        ...summarizeAiQuality(rows),
        totals: [...totals].map(([key, count]) => { const [stage, signal, outcome] = key.split("|"); return { stage, signal, outcome, count }; })
            .sort((a, b) => a.stage.localeCompare(b.stage) || b.count - a.count),
        daily: [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([day, dayRows]) => ({ day, ...summarizeAiQuality(dayRows).rates })),
    };
};
