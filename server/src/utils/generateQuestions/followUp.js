import { generateJSON } from "./aiClient.js";
import { recordAiQualityEvent } from "../../services/aiQuality.js";
import { sanitizeText } from "./textUtils.js";
import { questionSimilarity, recordGuardEvent, repeatsEarlierQuestion, unsupportedSpecifics } from "./questionGuards.js";

export const MAX_FOLLOW_UPS = 3;

export const normalizeFollowUpDecision = (raw, remaining = MAX_FOLLOW_UPS) => {
    if (remaining <= 0 || !raw || typeof raw !== "object") {
        return { shouldAsk: false, followUp: null, reason: "probe_budget_exhausted", focus: null, answerConfidence: 1, missingEvidence: [] };
    }
    const followUp = typeof raw.followUp === "string" ? raw.followUp.trim().slice(0, 1000) : "";
    const shouldAsk = raw.shouldAsk === true && Boolean(followUp);
    return {
        shouldAsk,
        followUp: shouldAsk ? followUp : null,
        reason: sanitizeText(raw.reason || (shouldAsk ? "useful_probe" : "answer_sufficient"), 240),
        focus: shouldAsk ? sanitizeText(raw.focus || "technical_depth", 120) : null,
        answerConfidence: Math.max(0, Math.min(1, Number(raw.answerConfidence) || 0)),
        missingEvidence: Array.isArray(raw.missingEvidence)
            ? raw.missingEvidence.map((item) => sanitizeText(item, 160)).filter(Boolean).slice(0, 4)
            : [],
    };
};

// Skipped probes stay in the history so the model does not re-ask a topic the candidate chose to move past.
const formatHistory = (followUps = []) => followUps
    .filter((item) => item?.question && (item?.answer || item?.skipped))
    .slice(0, MAX_FOLLOW_UPS)
    .map((item, index) => `Follow-up ${index + 1}: ${sanitizeText(item.question, 500)}\nCandidate: ${item.skipped ? "(chose to move on without answering)" : sanitizeText(item.answer, 1000)}`)
    .join("\n\n");

export const generateFollowUp = async ({
    questionText,
    userAnswer,
    followUps = [],
    jobRole,
    roundName,
    systemDesign = false,
    competencies = [],
    sourceClaim = "",
    candidateBackground = "",
}) => {
    const q = sanitizeText(questionText, 500);
    const a = sanitizeText(userAnswer, 1800);
    const role = sanitizeText(jobRole, 120);
    const rnd = sanitizeText(roundName, 80);
    const answeredFollowUps = (followUps || []).filter((item) => item?.answer || item?.skipped).slice(0, MAX_FOLLOW_UPS);
    const remaining = Math.max(0, MAX_FOLLOW_UPS - (followUps || []).length);
    if (remaining <= 0) return normalizeFollowUpDecision(null, 0);

    const history = formatHistory(answeredFollowUps);
    const competencyText = (Array.isArray(competencies) ? competencies : []).map((item) => sanitizeText(item, 80)).filter(Boolean).slice(0, 4).join(", ");
    const claim = sanitizeText(sourceClaim, 500);
    const background = sanitizeText(candidateBackground, 1200);
    const prompt = `You are conducting a realistic, conversational ${rnd || "technical"} interview for a ${role || "software engineering"} role.

Original question: "${q}"
Candidate's original answer: "${a}"
Target competencies: ${competencyText || "infer from the question"}
${claim ? `Resume claim being validated: ${claim}` : ""}
${background ? `Candidate's own introduction (background only; do not assume anything beyond it): ${background}
When that introduced experience is relevant to the gap you are probing, ground the follow-up in it (e.g. "In your shipment-tracking service, how would…"); otherwise ignore it.` : ""}
${history ? `\nConversation so far:\n${history}\n` : ""}
You may ask at most ${MAX_FOLLOW_UPS} follow-up questions for the original question. ${remaining} follow-up slot(s) remain.

Return ONLY valid JSON:
{"shouldAsk":boolean,"followUp":string|null,"reason":string,"focus":string|null,"answerConfidence":0.0,"missingEvidence":["..."]}

Decision policy:
- First estimate answerConfidence: confidence that the conversation already gives enough evidence to judge the IMPORTANT target competency, not confidence that the candidate is correct.
- Identify only decision-relevant missingEvidence. Ignore trivia and nice-to-have details.
- Ask ONE more follow-up only when missing evidence materially affects the competency judgment and a focused probe can resolve it.
- High-confidence complete evidence => stop, even if follow-up budget remains.
- Low confidence caused by one important ambiguity/unsupported claim/trade-off/failure case => probe that exact gap.
- Low confidence caused by a very thin or irrelevant answer may justify one rescue probe, but do not repeatedly re-ask the same concept.
- Base the next probe on the full conversation. Never repeat something already answered clearly, and never re-ask a follow-up the candidate chose to move on from.
- Each follow-up must target a different gap than earlier follow-ups; rephrasing the same probe (for example the same metric or number) counts as repeating it.
- Match the candidate's framing. If they answer hypothetically ("I would…"), ask how they would approach the gap; do not presume past projects, ownership, or measurements they have not described.
- Never introduce facts, numbers, tools, or outcomes the candidate did not state (for example "your increased code coverage" when coverage was never mentioned). Probe only what is in the conversation.
- Sound like a thoughtful human interviewer continuing the same conversation. Use concise transitions such as “Got it — …”, “Makes sense. How did you…”, or “Let’s go one level deeper…” only when they fit naturally; do not prepend filler mechanically.
- Keep the tone warm, neutral, and professional. Avoid robotic rubric language, interrogation-style wording, praise, judgment, or canned acknowledgements.
- Prefer depth over trivia. Ask one thing at a time, in natural interviewer language, usually one sentence.
- After two follow-ups, use the third only when uncertainty remains on a core hiring signal.
- Never coach, reveal an ideal answer, praise, score, or hint at what the candidate should say.
${claim ? "- For the resume claim, prioritize verification of actual ownership, measurement/evidence, technical decisions, constraints, trade-offs, or failure modes that remain unsupported." : ""}
${systemDesign ? "- For system design, probe an actual design choice: requirements, scale, API/data model, component boundaries, bottlenecks, consistency, failure handling, security, observability, or trade-offs. Do not invent components the candidate did not mention." : ""}
- If no additional probe is warranted, return shouldAsk=false and followUp=null.`;

    try {
        const context = [q, a, history, background, claim].join("\n");
        const earlier = (followUps || []).map((item) => item?.question).filter(Boolean);
        let decision = normalizeFollowUpDecision(JSON.parse((await generateJSON(prompt)) || "{}"), remaining);
        const invented = decision.shouldAsk ? unsupportedSpecifics(decision.followUp, context) : [];
        if (invented.length) {
            recordGuardEvent("followup", "invented_specifics", "retried");
            // One corrective retry; if the model still cites facts the candidate never gave, skip the probe.
            const retryPrompt = `${prompt}\n\nYour previous draft was: "${decision.followUp}". It cited ${invented.join(", ")}, which the candidate never said. Rewrite it without any number, metric, or result that is not in the conversation.`;
            decision = normalizeFollowUpDecision(JSON.parse((await generateJSON(retryPrompt)) || "{}"), remaining);
            if (decision.shouldAsk && unsupportedSpecifics(decision.followUp, context).length) {
                recordGuardEvent("followup", "invented_specifics", "suppressed");
                recordAiQualityEvent("followup", "decision", "skipped");
                return normalizeFollowUpDecision({ shouldAsk: false, reason: "ungrounded_followup_suppressed" }, remaining);
            }
            recordGuardEvent("followup", "invented_specifics", "recovered");
        }
        // Follow-ups naturally reuse the original question's terms, so only a near-duplicate of it counts;
        // earlier follow-ups are checked strictly (paraphrase or "same probe + extra clause").
        if (decision.shouldAsk && (repeatsEarlierQuestion(decision.followUp, earlier) || questionSimilarity(decision.followUp, q) >= 0.75)) {
            // Re-asking the same probe in new words frustrates candidates and adds no evidence; move on instead.
            recordGuardEvent("followup", "repeat", "suppressed");
            recordAiQualityEvent("followup", "decision", "skipped");
            return normalizeFollowUpDecision({ shouldAsk: false, reason: "repeated_followup_suppressed" }, remaining);
        }
        recordAiQualityEvent("followup", "decision", decision.shouldAsk ? "asked" : "skipped");
        return decision;
    } catch {
        recordAiQualityEvent("followup", "decision", "provider_unavailable");
        // A provider outage must not block the interview. Moving on is safer than
        // inventing an ungrounded follow-up locally.
        return normalizeFollowUpDecision({
            shouldAsk: false,
            followUp: null,
            reason: "followup_provider_unavailable",
            answerConfidence: 0,
            missingEvidence: [],
        }, remaining);
    }
};

export default generateFollowUp;
