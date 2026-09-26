import { generateJSON } from "./generateQuestions/aiClient.js";

export const FEEDBACK_PROMPT_VERSION = "feedback-2026-09-v1";
export const FEEDBACK_ENGINE_VERSION = "hiring-evaluator-v1";

const clamp = (value, min, max) => Math.min(Math.max(Number(value) || min, min), max);
const clean = (value, max) => (value || "").toString().replace(/\s+/g, " ").trim().slice(0, max);
const strings = (value, maxItems = 5, maxLength = 300) => Array.isArray(value)
    ? value.map((item) => clean(item, maxLength)).filter(Boolean).slice(0, maxItems)
    : [];

const dimensions = (value) => Array.isArray(value) ? value.map((item) => ({
    name: clean(item?.name, 80),
    score: clamp(item?.score, 0, 10),
    evidence: strings(item?.evidence, 4, 300),
})).filter((item) => item.name).slice(0, 6) : [];

const competencies = (value) => Array.isArray(value) ? value.map((item) => ({
    name: clean(item?.name, 80),
    score: clamp(item?.score, 0, 10),
    confidence: Math.max(0, Math.min(1, Number(item?.confidence) || 0)),
    evidence: strings(item?.evidence, 4, 300),
})).filter((item) => item.name).slice(0, 6) : [];

// audience "candidate" is Practice feedback read by the person who answered; "reviewer" is Hire feedback read by recruiters.
export const generateFeedbackForAnswer = async ({ questionText, userAnswer, evaluationContext, audience = "reviewer" }) => {
    const q = clean(questionText, 800);
    const a = (userAnswer || "").toString().trim().slice(0, 7000);
    if (!q) return { comment: "No question provided to evaluate.", score: 0, confidence: 0, suggestions: [], strengths: [], gaps: [], dimensions: [], competencies: [], evidence: [] };

    const systemDesign = evaluationContext?.mode === "system-design";
    const competencyNames = strings(evaluationContext?.competencies, 8, 80);
    const sourceClaim = clean(evaluationContext?.sourceClaim, 500);
    const context = systemDesign ? `
This is a system-design response for ${clean(evaluationContext.jobRole || "a technical role", 120)}.
Role context: ${clean(evaluationContext.jobDescription, 1600)}
Round focus: ${clean(evaluationContext.roundDescription, 300)}
Scorecard: ${(evaluationContext.rubric || []).map((item) => `${item.name}: ${item.description || ""}`).join("; ").slice(0, 1200)}
Evaluate requirements clarification, architecture coherence, data flow, scale/capacity reasoning, reliability, consistency, security, observability, and trade-offs. Treat diagram extraction as evidence, not ground truth. Do not reward visual polish or penalize drawing quality.` : `
Role: ${clean(evaluationContext?.jobRole, 120) || "technical role"}
Round: ${clean(evaluationContext?.roundName, 100) || "technical interview"}
Round focus: ${clean(evaluationContext?.roundDescription, 500)}
Competencies this question may inform: ${competencyNames.join(", ") || "derive only from the question and answer"}.`;

    const claimContext = sourceClaim ? `\nThe question was used to validate this resume claim: ${sourceClaim}. Evaluate only what the candidate actually substantiated; do not assume the claim is true or false.` : "";

    const prompt = `You are a rigorous, evidence-based technical interviewer.${context}${claimContext}
Return ONLY JSON in this shape:
{
  "comment":"concise overall assessment",
  "score":0,
  "confidence":0.0,
  "suggestions":["..."],
  "strengths":["..."],
  "gaps":["..."],
  "dimensions":[{"name":"Technical correctness","score":0,"evidence":["specific observation"]}],
  "competencies":[{"name":"competency name","score":0,"confidence":0.0,"evidence":["specific observation"]}],
  "evidence":["most decision-relevant observations"]
}

Question: ${q}
Candidate response, including any answered follow-ups:
${a || "<blank>"}

Rules:
- Score 0-10 using only evidence in the response. Never infer unstated knowledge.
- Confidence is confidence in this evaluation. Thin/vague evidence must lower confidence rather than merely lowering the score.
- Evaluate dimensions that are actually relevant. Usually consider Technical correctness, Depth, Trade-off reasoning, Communication, and Production awareness; omit irrelevant ones.
- For competencies, prefer the supplied competency names exactly. Do not create a long taxonomy.
- Evidence must be concrete observations tied to what the candidate said or omitted, not generic praise or criticism.
- suggestions should be actionable and specific to the gaps; max 5.
- A polished answer with incorrect technical claims should not score highly. A terse but correct answer may score well on correctness but lower on depth/evidence confidence.
- Do not reward verbosity by itself.${audience === "candidate" ? `
- The person who answered will read this feedback. Write comment, strengths, gaps, suggestions, and evidence in second person ("You explained…", "Add…"); never refer to "the candidate".` : ""}`;

    // An unparseable or scoreless response is retried once and then treated as a failure, so callers
    // retry the job instead of storing a fabricated 0 that would drag down a candidate's result.
    let obj = null;
    for (let attempt = 0; attempt < 2 && !obj; attempt += 1) {
        const text = await generateJSON(prompt);
        if (!text) continue;
        try {
            const parsed = JSON.parse(text);
            if (Number.isFinite(Number(parsed?.score))) obj = parsed;
        } catch (parseErr) {
            console.error("[Feedback:JSONParse] invalid provider response", parseErr?.message);
        }
    }
    if (!obj) throw new Error("AI providers returned no evaluation");

    let comment = clean(obj?.comment, 2000);
    if (!comment) comment = "Feedback unavailable.";
    const score = Math.max(0, Math.min(10, Math.round(Number(obj.score) * 10) / 10));
    const confidence = Math.max(0, Math.min(1, Number(obj?.confidence) || 0));
    return {
        comment,
        score,
        confidence,
        suggestions: strings(obj?.suggestions, 5, 240),
        strengths: strings(obj?.strengths, 5, 300),
        gaps: strings(obj?.gaps, 5, 300),
        dimensions: dimensions(obj?.dimensions),
        competencies: competencies(obj?.competencies),
        evidence: strings(obj?.evidence, 8, 400),
    };
};

export default generateFeedbackForAnswer;
