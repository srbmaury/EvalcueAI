import { RACE_ETHNICITY_CATEGORIES, SEX_CATEGORIES } from "../models/CandidateSelfIdentification.js";

// Groups smaller than this are counted but get no rates, so the report cannot single out individuals and
// small-sample noise is not presented as a finding.
export const MIN_GROUP_SIZE = 5;
// EEOC four-fifths rule of thumb: a group whose rate is below 80% of the most favoured group's rate is flagged.
export const FOUR_FIFTHS = 0.8;

const round = (value, places = 3) => (value === null ? null : Math.round(value * 10 ** places) / 10 ** places);

const median = (values) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// Adds rate/impact-ratio fields to raw group tallies. A rate is the share of a group with a favourable outcome;
// the impact ratio compares it with the highest rate among groups large enough to report.
const withImpactRatios = (groups, rateOf) => {
    const reportable = groups.filter((group) => group.eligible >= MIN_GROUP_SIZE);
    const best = Math.max(0, ...reportable.map(rateOf));
    return groups.map((group) => {
        if (group.eligible < MIN_GROUP_SIZE) return { ...group, rate: null, impactRatio: null, flagged: false, suppressed: true };
        const rate = rateOf(group);
        const impactRatio = best > 0 ? rate / best : null;
        return { ...group, rate: round(rate), impactRatio: round(impactRatio), flagged: impactRatio !== null && impactRatio < FOUR_FIFTHS, suppressed: false };
    });
};

const tally = (rows, keyOf, categories) => {
    const groups = new Map(categories.map((key) => [key, { key, eligible: 0, favourable: 0 }]));
    let notProvided = 0;
    for (const row of rows) {
        const key = keyOf(row);
        const group = key ? groups.get(key) : null;
        if (!group) { notProvided += 1; continue; }
        group.eligible += 1;
        if (row.favourable) group.favourable += 1;
    }
    return { groups: [...groups.values()], notProvided };
};

const intersectionalCategories = SEX_CATEGORIES.flatMap((sex) => RACE_ETHNICITY_CATEGORIES.map((race) => `${sex}|${race}`));

const outcomeReport = (rows) => {
    const build = (keyOf, categories) => {
        const { groups, notProvided } = tally(rows, keyOf, categories);
        return { groups: withImpactRatios(groups, (group) => group.favourable / group.eligible).filter((group) => group.eligible > 0), notProvided };
    };
    return {
        total: rows.length,
        sex: build((row) => row.sex, SEX_CATEGORIES),
        raceEthnicity: build((row) => row.raceEthnicity, RACE_ETHNICITY_CATEGORIES),
        intersectional: build((row) => (row.sex && row.raceEthnicity ? `${row.sex}|${row.raceEthnicity}` : ""), intersectionalCategories),
    };
};

// attempts: [{ overallScore, reviewerDecision, sex, raceEthnicity }]
// scoring:   favourable = scored above the median of all scored attempts in scope (the NYC LL144 "scoring rate").
// selection: favourable = reviewer decision "advance", among attempts that received any decision.
export const computeAdverseImpact = (attempts = []) => {
    const scored = attempts.filter((item) => Number.isFinite(item?.overallScore));
    const scoreMedian = median(scored.map((item) => item.overallScore));
    const scoringRows = scored.map((item) => ({ ...item, favourable: item.overallScore > scoreMedian }));
    const decided = attempts.filter((item) => ["advance", "hold", "reject"].includes(item?.reviewerDecision));
    const selectionRows = decided.map((item) => ({ ...item, favourable: item.reviewerDecision === "advance" }));
    return {
        minGroupSize: MIN_GROUP_SIZE,
        threshold: FOUR_FIFTHS,
        selfIdentified: attempts.filter((item) => item?.sex || item?.raceEthnicity).length,
        attempts: attempts.length,
        scoring: { median: scoreMedian === null ? null : round(scoreMedian, 2), ...outcomeReport(scoringRows) },
        selection: outcomeReport(selectionRows),
    };
};
