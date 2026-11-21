import { clamp, clean, keyOf, uniqueStrings } from "./normalization.js";

export const applyEvidenceToState = (state, evaluation, { questionIndex = 0, targetedCompetencies = [], sourceClaim = "" } = {}) => {
    const next = JSON.parse(JSON.stringify(state || {}));
    next.competencies = Array.isArray(next.competencies) ? next.competencies : [];
    const byKey = new Map(next.competencies.map((item, index) => [keyOf(item.name), { item, index }]));
    const updates = Array.isArray(evaluation?.competencyEvidence) ? evaluation.competencyEvidence : [];

    for (const update of updates) {
        const match = byKey.get(keyOf(update?.name));
        if (!match) continue;
        const item = match.item;
        const oldCount = Math.max(0, Number(item.evidenceCount) || 0);
        const score = Math.max(0, Math.min(10, Number(update.score) || 0));
        const newConfidence = Math.max(0, Math.min(1, Number(update.confidence) || 0));
        const oldScore = Number(item.scoreEstimate);
        item.scoreEstimate = Number.isFinite(oldScore)
            ? Math.round((((oldScore * oldCount) + score) / (oldCount + 1)) * 10) / 10
            : Math.round(score * 10) / 10;
        item.evidenceCount = oldCount + 1;
        item.confidence = Math.round(Math.min(0.98, (Number(item.confidence) || 0) + newConfidence * (1 - (Number(item.confidence) || 0)) * 0.72) * 100) / 100;
        item.coverage = item.confidence >= 0.7 && item.evidenceCount >= 2 ? "covered" : item.confidence >= 0.25 ? "partial" : "uncovered";
        const additions = uniqueStrings(update.evidence, 3, 300).map((text) => ({ text, score, confidence: newConfidence, questionIndex, createdAt: new Date() }));
        item.evidence = [...(Array.isArray(item.evidence) ? item.evidence : []), ...additions].slice(-6);
        item.updatedAt = new Date();
    }

    if (!updates.length && targetedCompetencies.length && !evaluation?.unscored) {
        for (const name of targetedCompetencies) {
            const match = byKey.get(keyOf(name));
            if (!match) continue;
            match.item.coverage = match.item.coverage === "uncovered" ? "partial" : match.item.coverage;
        }
    }

    next.questionsAsked = Math.max(Number(next.questionsAsked) || 0, questionIndex + 1);
    const currentDifficulty = clamp(next.currentDifficulty, 1, 5, 3);
    const requestedDifficulty = clamp(evaluation?.policy?.difficulty, 1, 5, currentDifficulty);
    next.currentDifficulty = Math.max(currentDifficulty - 1, Math.min(currentDifficulty + 1, requestedDifficulty));
    next.lastDecision = {
        action: evaluation?.policy?.action === "end-round" ? "end-round" : "next-question",
        targetCompetency: clean(evaluation?.policy?.targetCompetency, 80),
        sourceClaim: clean(evaluation?.policy?.sourceClaim, 500),
        reason: clean(evaluation?.policy?.reason, 500),
        confidence: Math.max(0, Math.min(1, Number(evaluation?.policy?.confidence) || 0)),
        difficulty: next.currentDifficulty,
        decidedAt: new Date(),
    };

    if (sourceClaim && Array.isArray(next.resumeClaims)) {
        const claimKey = keyOf(sourceClaim);
        const claim = next.resumeClaims.find((item) => keyOf(item.claim) === claimKey);
        if (claim) {
            claim.probeCount = (Number(claim.probeCount) || 0) + 1;
            if (claim.probeCount >= 2 || Number(evaluation?.confidence) >= 0.72) claim.covered = true;
        }
    }
    next.updatedAt = new Date();
    return next;
};

export const adaptiveCoverageRatio = (state) => {
    const competencies = Array.isArray(state?.competencies) ? state.competencies : [];
    if (!competencies.length) return 0;
    let weighted = 0;
    let total = 0;
    for (const item of competencies) {
        const weight = clamp(item?.weight, 0.1, 3, 1);
        const confidence = Math.max(0, Math.min(1, Number(item?.confidence) || 0));
        weighted += weight * Math.min(1, confidence / 0.72);
        total += weight;
    }
    return total ? weighted / total : 0;
};

export const chooseNextCompetency = (state) => {
    const competencies = Array.isArray(state?.competencies) ? state.competencies : [];
    if (!competencies.length) return "Technical Depth";
    return [...competencies].sort((a, b) => {
        const priority = (item) => {
            const weight = clamp(item?.weight, 0.1, 3, 1);
            const confidence = Math.max(0, Math.min(1, Number(item?.confidence) || 0));
            const score = Number(item?.scoreEstimate);
            const lowScoreBonus = Number.isFinite(score) && score < 6 ? 0.2 : 0;
            return weight * (1 - confidence + lowScoreBonus);
        };
        return priority(b) - priority(a);
    })[0]?.name || "Technical Depth";
};

export const shouldStopAdaptiveRound = (state, evaluation) => {
    const asked = Number(state?.questionsAsked) || 0;
    const min = clamp(state?.minQuestions, 1, 20, 2);
    const max = clamp(state?.maxQuestions, min, 20, Math.max(min, 5));
    if (asked >= max) return { stop: true, reason: "Maximum adaptive question budget reached." };
    if (asked < min) return { stop: false, reason: "Minimum evidence sample not reached." };

    const coverage = adaptiveCoverageRatio(state);
    const competencies = Array.isArray(state?.competencies) ? state.competencies : [];
    const importantGap = competencies.some((item) => (Number(item?.weight) || 1) >= 1 && (Number(item?.confidence) || 0) < 0.35);
    const policyWantsStop = evaluation?.policy?.action === "end-round";
    if (policyWantsStop && coverage >= 0.72 && !importantGap) {
        return { stop: true, reason: evaluation?.policy?.reason || "Sufficient evidence collected across the round competencies." };
    }
    if (coverage >= 0.9 && !importantGap) {
        return { stop: true, reason: "High-confidence competency coverage reached; further questions would add little signal." };
    }
    return { stop: false, reason: evaluation?.policy?.reason || "More evidence is useful." };
};
