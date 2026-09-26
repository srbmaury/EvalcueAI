import { generateJSON } from "../utils/generateQuestions/aiClient.js";
import { generateQuestionsForRound } from "../utils/generateQuestions.js";
import { sanitizeText } from "../utils/generateQuestions/textUtils.js";
import { recordGuardEvent, repeatsEarlierQuestion, unsupportedSpecifics } from "../utils/generateQuestions/questionGuards.js";

const clamp = (value, min, max, fallback = min) => {
    const parsed = Number(value);
    const resolved = Number.isFinite(parsed) ? parsed : fallback;
    return Math.min(Math.max(resolved, min), max);
};
const clean = (value, max = 300) => sanitizeText(value, max);
const keyOf = (value) => clean(value, 120).toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim();
const MAX_RESUME_CLAIM_BASE_QUESTIONS = 2;
const isSystemDesignRound = (round = {}) => /system\s*design|architecture/i.test(`${round?.name || round?.roundName || ""} ${round?.description || round?.roundDescription || ""}`);

const uniqueStrings = (values, max = 8, length = 120) => {
    const out = [];
    const seen = new Set();
    for (const value of Array.isArray(values) ? values : []) {
        const text = clean(value, length);
        const key = keyOf(text);
        if (!text || !key || seen.has(key)) continue;
        seen.add(key);
        out.push(text);
        if (out.length >= max) break;
    }
    return out;
};

const fallbackCompetencies = ({ roundName = "", roundDescription = "", skills = [] } = {}) => {
    const explicit = uniqueStrings(skills, 6, 80);
    if (explicit.length >= 3) {
        return explicit.map((name) => ({ name, description: `Demonstrate practical depth in ${name}.`, weight: 1 }));
    }

    const text = `${roundName} ${roundDescription}`.toLowerCase();
    let names;
    if (/system\s*design|architecture/.test(text)) {
        names = ["Requirements", "Architecture", "Data & APIs", "Scalability & Reliability", "Trade-off Reasoning"];
    } else if (/coding|algorithm|dsa|problem solving/.test(text)) {
        names = ["Problem Solving", "Correctness", "Complexity", "Code Quality"];
    } else if (/frontend|web|react|javascript/.test(text)) {
        names = ["Frontend Architecture", "State & Data Flow", "Performance", "Web Quality"];
    } else if (/mobile|android|ios/.test(text)) {
        names = ["Mobile Architecture", "State & Lifecycle", "Reliability", "Performance"];
    } else if (/machine learning|\bml\b|data science/.test(text)) {
        names = ["ML Fundamentals", "Evaluation", "Data Reasoning", "Production ML"];
    } else if (/platform|sre|reliability|devops|infrastructure/.test(text)) {
        names = ["Systems Reasoning", "Reliability", "Observability", "Operational Judgment"];
    } else if (/behavior|leadership|ownership|manager/.test(text)) {
        names = ["Ownership", "Decision Quality", "Communication", "Execution"];
    } else if (/backend|api|database|distributed/.test(text)) {
        names = ["Backend Fundamentals", "Data & APIs", "Reliability", "Technical Trade-offs"];
    } else {
        names = [...explicit, "Technical Depth", "Trade-off Reasoning", "Production Judgment"];
    }
    return uniqueStrings(names, 6, 80).map((name) => ({ name, description: `Demonstrate role-relevant evidence for ${name}.`, weight: 1 }));
};

export const extractResumeClaimsFallback = (resumeText = "") => {
    const text = (resumeText || "").toString().replace(/\r/g, "\n");
    if (!text.trim()) return [];
    const candidates = text
        .split(/\n+|(?<=[.!?])\s+/)
        .map((line) => clean(line, 500))
        .filter((line) => line.length >= 28)
        .filter((line) => /\b(built|designed|architected|led|implemented|optimized|improved|reduced|increased|migrated|scaled|automated|created|delivered|owned|launched)\b/i.test(line));
    const ranked = [...candidates].sort((a, b) => {
        const score = (line) => (/\d+\s*%|\d+x|\d+\+|\b\d+\b/i.test(line) ? 2 : 0) + (/reduced|increased|improved|scaled|led|architected/i.test(line) ? 1 : 0);
        return score(b) - score(a);
    });
    return uniqueStrings(ranked, 6, 500).map((claim) => ({
        claim,
        topics: [],
        probeAreas: ["own contribution", "measurement or evidence", "technical trade-offs", "constraints or failure modes"],
        probeCount: 0,
        covered: false,
    }));
};

const normalizeCompetencies = (items, fallback) => {
    const source = Array.isArray(items) && items.length ? items : fallback;
    const out = [];
    const seen = new Set();
    for (const item of source || []) {
        const name = clean(typeof item === "string" ? item : item?.name, 80);
        const key = keyOf(name);
        if (!name || !key || seen.has(key)) continue;
        seen.add(key);
        out.push({
            name,
            description: clean(typeof item === "string" ? "" : item?.description, 240),
            weight: clamp(typeof item === "string" ? 1 : item?.weight, 0.1, 3, 1),
            scoreEstimate: null,
            confidence: 0,
            evidenceCount: 0,
            coverage: "uncovered",
            evidence: [],
        });
        if (out.length >= 6) break;
    }
    return out.length >= 2 ? out : fallback.slice(0, 4).map((item) => ({ ...item, scoreEstimate: null, confidence: 0, evidenceCount: 0, coverage: "uncovered", evidence: [] }));
};

const normalizeClaims = (items, fallback) => {
    const source = Array.isArray(items) && items.length ? items : fallback;
    const out = [];
    const seen = new Set();
    for (const item of source || []) {
        const claim = clean(typeof item === "string" ? item : item?.claim, 500);
        const key = keyOf(claim);
        if (!claim || !key || seen.has(key)) continue;
        seen.add(key);
        out.push({
            claim,
            topics: uniqueStrings(item?.topics, 5, 80),
            probeAreas: uniqueStrings(item?.probeAreas, 5, 120),
            probeCount: 0,
            covered: false,
        });
        if (out.length >= 6) break;
    }
    return out;
};

export const initializeAdaptiveInterviewState = async ({
    jobRole,
    jobDescription,
    roundName,
    roundDescription,
    skills = [],
    resumeText = "",
    maxQuestions = 5,
}) => {
    const systemDesign = isSystemDesignRound({ name: roundName, description: roundDescription });
    const fallback = fallbackCompetencies({ roundName, roundDescription, skills });
    const fallbackClaims = systemDesign ? [] : extractResumeClaimsFallback(resumeText);
    const boundedMax = systemDesign ? 1 : clamp(maxQuestions, 2, 10, 5);
    const safeRole = clean(jobRole, 120);
    const safeJD = clean(jobDescription, 3500);
    const safeRound = clean(roundName, 80);
    const safeRoundDescription = clean(roundDescription, 500);
    const safeResume = systemDesign ? "" : clean(resumeText, 5000);

    if (systemDesign) {
        return {
            enabled: false,
            minQuestions: 1,
            maxQuestions: 1,
            currentDifficulty: 3,
            questionsAsked: 0,
            competencies: normalizeCompetencies([], fallback),
            resumeClaims: [],
            lastDecision: { action: "continue", difficulty: 3, confidence: 0 },
            completedReason: "",
            initializedAt: new Date(),
            updatedAt: new Date(),
        };
    }

    let parsed = {};
    try {
        const prompt = `Design the evidence plan for ONE adaptive technical interview round.
Return ONLY JSON:
{"competencies":[{"name":"...","description":"...","weight":1}],"resumeClaims":[{"claim":"...","topics":["..."],"probeAreas":["..."]}],"initialDifficulty":3,"minQuestions":2}

Role: ${safeRole}
Job description: ${safeJD}
Round: ${safeRound}
Round purpose: ${safeRoundDescription}
Suggested skills: ${uniqueStrings(skills, 8, 80).join(", ") || "<none>"}
Resume: ${safeResume || "<none>"}

Rules:
- Produce 3-6 distinct competencies that this round should actually measure. Do not duplicate synonyms.
- Competency names must be concise and observable. Give higher weight (up to 1.5) only to clearly core capabilities.
- Extract at most 6 resume claims worth validating in THIS round. Prefer quantified impact, architecture/ownership claims, migrations, scale, reliability, performance, or difficult technical work.
- A resume claim must be copied/paraphrased faithfully; never invent achievements.
- probeAreas should focus on evidence such as ownership, measurement, design decisions, trade-offs, constraints, failure modes, and lessons.
- initialDifficulty is 1-5; 3 is normal interview level. Use 4 for clearly senior/staff-level depth, never 5 by default.
- minQuestions should normally be 2-3 and must be less than or equal to ${boundedMax}.
- Do not include generic HR/culture competencies unless this round is explicitly behavioral/leadership.`;
        const raw = (await generateJSON(prompt)) || "{}";
        parsed = JSON.parse(raw);
    } catch {
        parsed = {};
    }

    const initialDifficulty = clamp(parsed?.initialDifficulty, 1, 5, 3);
    return {
        enabled: true,
        minQuestions: clamp(parsed?.minQuestions, 2, boundedMax, 2),
        maxQuestions: boundedMax,
        currentDifficulty: initialDifficulty,
        questionsAsked: 0,
        competencies: normalizeCompetencies(parsed?.competencies, fallback),
        resumeClaims: normalizeClaims(parsed?.resumeClaims, fallbackClaims),
        lastDecision: { action: "continue", difficulty: initialDifficulty, confidence: 0 },
        completedReason: "",
        initializedAt: new Date(),
        updatedAt: new Date(),
    };
};

const normalizedDimension = (item) => ({
    name: clean(item?.name, 80),
    score: clamp(item?.score, 0, 10, 0),
    evidence: uniqueStrings(item?.evidence, 4, 300),
});

const normalizedCompetencyEvidence = (item) => ({
    name: clean(item?.name, 80),
    score: clamp(item?.score, 0, 10, 0),
    confidence: Math.max(0, Math.min(1, Number(item?.confidence) || 0)),
    evidence: uniqueStrings(item?.evidence, 4, 300),
});

const summaryForPrompt = (state) => (state?.competencies || []).map((item) => ({
    name: item.name,
    weight: item.weight,
    scoreEstimate: item.scoreEstimate,
    confidence: item.confidence,
    evidenceCount: item.evidenceCount,
    coverage: item.coverage,
}));

// Recorded when the evaluator could not produce a score. It adds no competency evidence, so the
// round keeps probing, and reviewers see "unscored" instead of a fabricated middling score.
const unscoredEvaluation = (currentDifficulty) => ({
    unscored: true,
    overallScore: null,
    confidence: 0,
    dimensions: [],
    competencyEvidence: [],
    strengths: [],
    gaps: [],
    policy: { action: "next-question", targetCompetency: "", difficulty: currentDifficulty, reason: "Evaluation unavailable for the previous answer.", confidence: 0, sourceClaim: "" },
});

export const evaluateAdaptiveAnswer = async ({
    questionText,
    answerText,
    targetedCompetencies = [],
    sourceClaim = "",
    state,
    jobRole,
    roundName,
}) => {
    const questionsAskedAfterThis = (Number(state?.questionsAsked) || 0) + 1;
    const minQuestions = clamp(state?.minQuestions, 1, 20, 2);
    const maxQuestions = clamp(state?.maxQuestions, minQuestions, 20, Math.max(minQuestions, 5));
    const currentDifficulty = clamp(state?.currentDifficulty, 1, 5, 3);
    const safeAnswer = clean(answerText, 6500);
    let parsed = {};
    try {
        const prompt = `Evaluate one completed technical interview question and recommend the interviewer policy for what happens NEXT.
Return ONLY JSON:
{
  "overallScore": 0,
  "confidence": 0.0,
  "dimensions":[{"name":"Technical correctness","score":0,"evidence":["specific observed evidence"]}],
  "competencyEvidence":[{"name":"exact competency name","score":0,"confidence":0.0,"evidence":["specific observed evidence"]}],
  "strengths":["..."],
  "gaps":["..."],
  "policy":{"action":"next-question|end-round","targetCompetency":"...","difficulty":3,"reason":"...","confidence":0.0,"sourceClaim":""}
}

Role: ${clean(jobRole, 120)}
Round: ${clean(roundName, 80)}
Question: ${clean(questionText, 700)}
Targeted competencies: ${uniqueStrings(targetedCompetencies, 6, 80).join(", ") || "<none>"}
${sourceClaim ? `Resume claim being validated: ${clean(sourceClaim, 500)}` : "Resume claim being validated: <none>"}
Candidate response, including answered follow-ups:
${safeAnswer || "<blank>"}

Current competency state:
${JSON.stringify(summaryForPrompt(state))}
Current difficulty: ${currentDifficulty}
Questions completed after this one: ${questionsAskedAfterThis}
Minimum questions: ${minQuestions}
Maximum questions: ${maxQuestions}

Evaluation rules:
- Score only evidence actually present in the response. Never infer unstated knowledge.
- Dimensions should usually cover Technical correctness, Depth, Trade-off reasoning, Communication, and Production awareness when applicable; omit irrelevant dimensions.
- competencyEvidence names MUST match the supplied competency state where possible.
- Evidence strings must cite concise observations from the response, not generic judgments.
- Confidence means confidence in the competency estimate, not confidence in the candidate.
- A weak answer with little evidence should have LOW confidence, not merely a low score.
- Recommend a next question when important competency evidence is weak/uncertain or coverage is incomplete.
- Difficulty is 1-5. Increase by at most 1 after strong high-confidence evidence; decrease by at most 1 after repeated inability to engage. Do not make the interview artificially easy after one weak answer.
- Do not recommend end-round before ${minQuestions} questions. At ${maxQuestions}, recommend end-round.
- Before the maximum, recommend end-round only when the important competencies already have enough evidence; avoid redundant questions.
- If an unvalidated resume claim is highly relevant to an uncertain competency, sourceClaim may name that exact claim for the next question. Never invent a claim.`;
        // One retry: a failed call or unparseable JSON must never turn into a made-up score.
        for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
                parsed = JSON.parse((await generateJSON(prompt)) || "{}");
            } catch {
                parsed = {};
            }
            if (Number.isFinite(Number(parsed?.overallScore))) break;
        }
    } catch {
        parsed = {};
    }

    const rawScore = Number(parsed?.overallScore);
    if (!Number.isFinite(rawScore)) return unscoredEvaluation(currentDifficulty);
    const overallScore = Math.max(0, Math.min(10, rawScore));
    const confidence = Math.max(0, Math.min(1, Number(parsed?.confidence) || (safeAnswer ? 0.25 : 0.1)));
    const dimensions = (Array.isArray(parsed?.dimensions) ? parsed.dimensions : [])
        .map(normalizedDimension)
        .filter((item) => item.name)
        .slice(0, 6);
    let competencyEvidence = (Array.isArray(parsed?.competencyEvidence) ? parsed.competencyEvidence : [])
        .map(normalizedCompetencyEvidence)
        .filter((item) => item.name)
        .slice(0, 6);
    if (!competencyEvidence.length && targetedCompetencies.length) {
        competencyEvidence = uniqueStrings(targetedCompetencies, 4, 80).map((name) => ({
            name,
            score: overallScore,
            confidence: Math.min(confidence, 0.35),
            evidence: safeAnswer ? ["Response provided some evidence for the targeted competency."] : ["No substantive response evidence was provided."],
        }));
    }

    const policy = parsed?.policy || {};
    const requestedDifficulty = clamp(policy?.difficulty, 1, 5, currentDifficulty);
    const boundedDifficulty = Math.max(currentDifficulty - 1, Math.min(currentDifficulty + 1, requestedDifficulty));
    return {
        overallScore,
        confidence,
        dimensions,
        competencyEvidence,
        strengths: uniqueStrings(parsed?.strengths, 5, 300),
        gaps: uniqueStrings(parsed?.gaps, 5, 300),
        policy: {
            action: policy?.action === "end-round" ? "end-round" : "next-question",
            targetCompetency: clean(policy?.targetCompetency, 80),
            difficulty: clamp(boundedDifficulty, 1, 5, currentDifficulty),
            reason: clean(policy?.reason, 500),
            confidence: Math.max(0, Math.min(1, Number(policy?.confidence) || 0)),
            sourceClaim: clean(policy?.sourceClaim, 500),
        },
    };
};

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

export const selectResumeClaimForTarget = (state, targetCompetency = "", preferredClaim = "") => {
    const claims = (Array.isArray(state?.resumeClaims) ? state.resumeClaims : []).filter((item) => !item?.covered);
    if (!claims.length) return null;
    const claimQuestionsAsked = (state?.resumeClaims || []).reduce((sum, item) => sum + Math.min(1, Number(item?.probeCount) || 0), 0);
    if (claimQuestionsAsked >= MAX_RESUME_CLAIM_BASE_QUESTIONS) return null;
    if (preferredClaim) {
        const preferredKey = keyOf(preferredClaim);
        const match = claims.find((item) => keyOf(item.claim) === preferredKey);
        if (match) return match;
    }
    const target = keyOf(targetCompetency);
    const relevant = target ? claims.find((item) => (item.topics || []).some((topic) => target.includes(keyOf(topic)) || keyOf(topic).includes(target))) : null;
    if (relevant) return relevant;
    return [...claims].sort((a, b) => (Number(a.probeCount) || 0) - (Number(b.probeCount) || 0))[0] || null;
};

export const buildDeterministicAdaptiveQuestion = ({
    round,
    state,
    targetCompetency,
    difficulty,
    sourceClaim,
} = {}) => {
    const target = clean(targetCompetency || chooseNextCompetency(state), 80) || "technical depth";
    const level = clamp(difficulty, 1, 5, clamp(state?.currentDifficulty, 1, 5, 3));
    const claim = isSystemDesignRound(round) ? "" : clean(sourceClaim, 500);
    const questionNumber = Math.max(0, Number(state?.questionsAsked) || 0);
    if (claim) {
        const claimEntry = (state?.resumeClaims || []).find((item) => keyOf(item.claim) === keyOf(claim));
        const probeIndex = Math.max(0, Number(claimEntry?.probeCount) || 0) % 4;
        const probes = [
            `You mentioned “${claim}”. What was your specific technical contribution that directly led to this result?`,
            `You mentioned “${claim}”. How did you measure the result and establish that the change actually caused it?`,
            `You mentioned “${claim}”. What was the most important technical trade-off you made to achieve it?`,
            `You mentioned “${claim}”. What constraint or failure mode was hardest to handle in that work?`,
        ];
        return {
            text: clean(probes[probeIndex], 500),
            tags: [target.toLowerCase()].filter(Boolean),
            competencies: [target],
            difficulty: level,
            sourceType: "resume-claim",
            sourceClaim: claim,
        };
    }

    const roundText = `${round?.name || ""} ${round?.description || ""}`.toLowerCase();
    let variants;
    if (/system\s*design|architecture/.test(roundText)) {
        variants = [
            "Design a URL shortening service like Bitly.",
            "Design a real-time chat system like WhatsApp.",
            "Design a cloud file storage and sharing service like Google Drive.",
            "Design a notification service that supports push, email, and SMS.",
        ];
    } else if (/coding|algorithm|dsa|problem solving/.test(roundText)) {
        variants = [
            `Give a concrete example of how you would approach a ${target} problem while keeping correctness and complexity under control.`,
            `For ${target}, what edge case is most likely to break an otherwise reasonable implementation?`,
            `For ${target}, what optimization would you consider only after proving the straightforward solution is correct?`,
            `For ${target}, how would you test that an implementation handles its hardest boundary condition correctly?`,
        ];
    } else if (/behavior|leadership|ownership|manager/.test(roundText)) {
        variants = [
            `Tell me about a specific situation where your ${target} was tested and the decision you personally made.`,
            `Tell me about a ${target} decision that did not go as planned and what you changed afterward.`,
            `Describe a situation where ${target} required you to make a difficult trade-off under uncertainty.`,
            `Give an example where your approach to ${target} changed after new evidence emerged.`,
        ];
    } else {
        variants = [
            `Give me a concrete example of ${target} from your work and explain the main technical trade-off you made.`,
            `For ${target}, what production failure or constraint changed how you approached the problem?`,
            `For ${target}, what decision becomes harder at larger scale, and how would you reason about it?`,
            `For ${target}, describe an alternative approach you considered and why you would choose one over the other.`,
        ];
    }
    const text = variants[questionNumber % variants.length];
    return {
        text: clean(text, 500),
        tags: [target.toLowerCase()].filter(Boolean),
        competencies: [target],
        difficulty: level,
        sourceType: "fallback",
        sourceClaim: "",
    };
};

export const generateNextAdaptiveQuestion = async ({
    interview,
    round,
    state,
    targetCompetency,
    difficulty,
    sourceClaim,
    excludeTexts = [],
}) => {
    const target = clean(targetCompetency || chooseNextCompetency(state), 80);
    const level = clamp(difficulty, 1, 5, clamp(state?.currentDifficulty, 1, 5, 3));
    const systemDesign = isSystemDesignRound(round);
    const claim = systemDesign ? "" : clean(sourceClaim, 500);
    const exclusions = uniqueStrings(excludeTexts, 20, 220);

    if (systemDesign) {
        try {
            const standard = await generateQuestionsForRound({
                company: "",
                jobRole: interview?.jobRole || "",
                jobDescription: interview?.jobDescription || "",
                resumeText: "",
                roundName: round?.name || "System Design",
                roundDescription: round?.description || "Design a production system and defend the key trade-offs.",
                deliveryMode: "conversational",
                count: 1,
                excludeTexts: exclusions,
                grounding: null,
            });
            const item = Array.isArray(standard) ? standard[0] : null;
            if (item?.text || typeof item === "string") {
                return {
                    text: clean(typeof item === "string" ? item : item.text, 500),
                    tags: uniqueStrings(item?.tags || ["system design"], 6, 60),
                    competencies: uniqueStrings(["Requirements", "Architecture", "Scalability & Reliability", "Trade-off Reasoning"], 4, 80),
                    difficulty: level,
                    sourceType: "planned",
                    sourceClaim: "",
                };
            }
        } catch {
            // Use a canonical local design problem below.
        }
        return buildDeterministicAdaptiveQuestion({ round, state, targetCompetency: target, difficulty: level, sourceClaim: "" });
    }

    const difficultyGuide = {
        1: "fundamentals and basic explanation",
        2: "basic application with a concrete example",
        3: "normal interview-level application and trade-offs",
        4: "senior-level depth, edge cases, production constraints, and trade-offs",
        5: "expert-level ambiguity, scale/failure interactions, and difficult architectural judgment",
    }[level];

    try {
        const prompt = `Generate exactly ONE next question for an adaptive technical interview.
Return ONLY JSON:
{"text":"...","tags":["..."],"competencies":["..."],"difficulty":${level},"sourceType":"adaptive|resume-claim","sourceClaim":""}

Role: ${clean(interview?.jobRole, 120)}
Job description: ${clean(interview?.jobDescription, 3000)}
Round: ${clean(round?.name, 80)}
Round purpose: ${clean(round?.description, 500)}
Target competency: ${target}
Difficulty ${level}: ${difficultyGuide}
Current competency state: ${JSON.stringify(summaryForPrompt(state))}
${claim ? `Resume claim to validate: ${claim}\nProbe areas: ${uniqueStrings((state?.resumeClaims || []).find((item) => keyOf(item.claim) === keyOf(claim))?.probeAreas, 5, 120).join(", ")}` : "Resume claim to validate: <none>"}
${interview?.candidateIntro ? `Candidate's own introduction (background only; never assume anything beyond it): ${clean(interview.candidateIntro, 1200)}\n` : ""}Already asked questions: ${exclusions.join(" | ") || "<none>"}

Rules:
- Ask one high-signal question, not a multi-part checklist.
- The question must materially improve evidence for the target competency.
- Do not repeat or trivially paraphrase an already asked question.
- Match the requested difficulty without trivia. Higher difficulty should come from reasoning, constraints, failure modes, scale, or trade-offs.
- If a resume claim is supplied, ask a natural verification/depth question about that exact claim. Do not accuse the candidate and do not invent details.
- Never presume projects, metrics, results, or technologies the candidate has not stated (for example "your 50% latency reduction" or "your caching strategy"). Without a resume claim, ask how they would approach the problem, or ask them to describe a relevant example of their own.
- Do not coach, reveal the answer, or tell the candidate what dimensions are being scored.
- competencies should contain the target competency and at most two closely related competencies.
- sourceType must be resume-claim when a claim is supplied, otherwise adaptive.`;
        const context = [interview?.jobDescription, interview?.candidateIntro, interview?.resume?.extractedText, claim].filter(Boolean).join("\n");
        const problemsWith = (candidate) => {
            const invented = unsupportedSpecifics(candidate, context);
            if (invented.length) return `It cited ${invented.join(", ")}, which the candidate never stated.`;
            if (repeatsEarlierQuestion(candidate, exclusions)) return "It repeats an already asked question.";
            return "";
        };
        let parsed = JSON.parse((await generateJSON(prompt)) || "{}");
        let text = clean(parsed?.text, 500);
        const problem = text ? problemsWith(text) : "";
        if (problem) {
            const guard = problem.startsWith("It cited") ? "invented_specifics" : "repeat";
            recordGuardEvent("next_question", guard, "retried");
            // One corrective retry; if it is still ungrounded or repetitive, use the grounded fallback below.
            parsed = JSON.parse((await generateJSON(`${prompt}\n\nYour previous draft was: "${text}". ${problem} Write a different question that follows the rules.`)) || "{}");
            text = clean(parsed?.text, 500);
            if (text && problemsWith(text)) { text = ""; recordGuardEvent("next_question", guard, "suppressed"); } else if (text) recordGuardEvent("next_question", guard, "recovered");
        }
        if (text) {
            return {
                text,
                tags: uniqueStrings(parsed?.tags, 6, 60),
                competencies: uniqueStrings([target, ...(parsed?.competencies || [])], 3, 80),
                difficulty: level,
                sourceType: claim ? "resume-claim" : "adaptive",
                sourceClaim: claim,
            };
        }
    } catch {
        // Fall through to the existing grounded generator and then local fallback.
    }

    try {
        const fallback = await generateQuestionsForRound({
            company: interview?.company || "",
            jobRole: interview?.jobRole || "",
            jobDescription: interview?.jobDescription || "",
            resumeText: interview?.resume?.extractedText || "",
            roundName: round?.name || "Technical",
            roundDescription: `${round?.description || ""} Focus next on ${target}. Difficulty ${level}/5.`,
            deliveryMode: "conversational",
            count: 1,
            excludeTexts: exclusions,
            grounding: interview?.grounding,
        });
        const item = Array.isArray(fallback) ? fallback[0] : null;
        if (item) {
            return {
                text: clean(typeof item === "string" ? item : item.text, 500),
                tags: uniqueStrings(item?.tags, 6, 60),
                competencies: [target],
                difficulty: level,
                sourceType: "fallback",
                sourceClaim: claim,
            };
        }
    } catch {
        // Provider outage or malformed generation must not make the interview unusable.
    }

    return buildDeterministicAdaptiveQuestion({
        round,
        state,
        targetCompetency: target,
        difficulty: level,
        sourceClaim: claim,
    });
};

export const compactAdaptiveState = (state) => ({
    enabled: Boolean(state?.enabled),
    minQuestions: Number(state?.minQuestions) || 0,
    maxQuestions: Number(state?.maxQuestions) || 0,
    currentDifficulty: Number(state?.currentDifficulty) || 3,
    questionsAsked: Number(state?.questionsAsked) || 0,
    coverage: Math.round(adaptiveCoverageRatio(state) * 100),
    completedReason: state?.completedReason || "",
    competencies: (state?.competencies || []).map((item) => ({
        name: item.name,
        scoreEstimate: item.scoreEstimate,
        confidence: item.confidence,
        evidenceCount: item.evidenceCount,
        coverage: item.coverage,
    })),
});
