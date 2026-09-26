import { generateJSON } from "../utils/generateQuestions/aiClient.js";
import { recordGuardEvent, repeatsEarlierQuestion } from "../utils/generateQuestions/questionGuards.js";
import { sanitizeText } from "../utils/generateQuestions/textUtils.js";

const ALLOWED_KINDS = new Set(["clarify", "challenge", "constraint", "scale", "failure", "tradeoff", "security", "observability"]);

export const normalizeSystemDesignInterjection = (raw) => {
    if (!raw || typeof raw !== "object" || raw.shouldInterrupt !== true) {
        return { shouldInterrupt: false, interjection: null, kind: null, reason: sanitizeText(raw?.reason || "continue_listening", 180) };
    }
    const interjection = sanitizeText(raw.interjection || "", 600);
    if (!interjection) return { shouldInterrupt: false, interjection: null, kind: null, reason: "empty_interjection" };
    const kind = ALLOWED_KINDS.has(raw.kind) ? raw.kind : "challenge";
    return {
        shouldInterrupt: true,
        interjection,
        kind,
        reason: sanitizeText(raw.reason || "useful_interviewer_probe", 180),
    };
};

const fallbackForcedInterjection = ({ previousInterjections = [], candidateAskedQuestion = false }) => {
    if (candidateAskedQuestion) {
        return normalizeSystemDesignInterjection({
            shouldInterrupt: true,
            interjection: "Assume a large consumer-scale product with global users and enough traffic that horizontal scaling and failure handling matter. You can state any additional assumptions you need.",
            kind: "clarify",
            reason: "fallback_candidate_clarification",
        });
    }
    const probes = [
        { kind: "clarify", text: "Let's get started—what requirements and scale assumptions would you clarify before choosing an architecture?" },
        { kind: "challenge", text: "Walk me through the main request and data flow end to end—where do you expect the first bottleneck?" },
        { kind: "failure", text: "Suppose one of your critical data stores becomes unavailable—how does the system behave?" },
        { kind: "tradeoff", text: "Which consistency guarantees actually matter here, and what are you willing to trade for availability or latency?" },
        { kind: "scale", text: "Suppose traffic grows 10× from your current assumption—what part of this design changes first?" },
        { kind: "observability", text: "How would you know in production that this design is degrading before users start reporting it?" },
    ];
    const index = Math.min(previousInterjections.length, probes.length - 1);
    const probe = probes[index];
    return normalizeSystemDesignInterjection({
        shouldInterrupt: true,
        interjection: probe.text,
        kind: probe.kind,
        reason: "forced_live_interviewer_probe",
    });
};

export const generateSystemDesignInterjection = async ({
    problem,
    transcript,
    diagramSummary = "",
    jobRole = "",
    roundName = "System Design",
    previousInterjections = [],
    forceInteraction = false,
    candidateAskedQuestion = false,
}) => {
    const recentTranscript = sanitizeText(transcript || "", 5000);
    if (recentTranscript.length < 20) {
        if (forceInteraction) return fallbackForcedInterjection({ previousInterjections, candidateAskedQuestion });
        return normalizeSystemDesignInterjection({ shouldInterrupt: false, reason: "not_enough_context" });
    }
    if (!forceInteraction && recentTranscript.length < 80) return normalizeSystemDesignInterjection({ shouldInterrupt: false, reason: "not_enough_context" });

    const prior = (previousInterjections || [])
        .map((item) => sanitizeText(item, 500))
        .filter(Boolean)
        .slice(-8)
        .map((item, index) => `${index + 1}. ${item}`)
        .join("\n");

    const prompt = `You are a senior software engineer conducting a live, interactive system-design interview for a ${sanitizeText(jobRole || "software engineering", 120)} role.

Design problem:
${sanitizeText(problem || "Design the requested system.", 1000)}

Candidate's live discussion transcript so far:
${recentTranscript}

Current whiteboard summary:
${sanitizeText(diagramSummary || "No meaningful diagram elements are visible yet.", 2200)}

${prior ? `Questions/challenges you already interjected with:\n${prior}\n` : ""}
Candidate just asked the interviewer a clarification question: ${candidateAskedQuestion ? "YES" : "NO"}.
This checkpoint ${forceInteraction ? "REQUIRES an interviewer turn now" : "lets you decide whether to interject now"}.

Return ONLY valid JSON:
{"shouldInterrupt":boolean,"interjection":string|null,"kind":"clarify|challenge|constraint|scale|failure|tradeoff|security|observability|null","reason":string}

Interview behavior:
- The candidate owns the design. Do not coach, suggest components, reveal an ideal architecture, or praise/judge the answer.
- This must feel like a real two-way interview, not a monologue.
- If the candidate asked a clarification question, ANSWER it directly as the interviewer by supplying a realistic requirement, scale assumption, product constraint, or scope decision. Do not dodge the question by asking another question.
- When this checkpoint REQUIRES an interviewer turn for another reason, return shouldInterrupt=true and ask exactly one high-value question grounded in the discussion so far.
- Otherwise, remain silent when the candidate is in the middle of a coherent thought or there is no useful reason to interrupt.
- Good reasons to probe: an important requirement is ambiguous; the candidate makes a consequential assumption without validating it; a key design choice needs justification; scale changes the architecture; a failure mode is being skipped; a trade-off was asserted without support; or the candidate has reached a natural point where a thoughtful interviewer would introduce a new constraint.
- Keep every interviewer turn concise and natural. One response or one question, usually one sentence and never more than two short sentences.
- Make probes directly grounded in something the candidate has actually said or drawn whenever possible.
- Never repeat a prior interjection, including in new words. If you already probed a dimension (for example scale or peak load), move to a different one (data model, failure handling, consistency, security, observability) unless the candidate's newest statement raises something new about it.
- Prefer discussion across requirements, capacity/scale, APIs/data model, component boundaries, data flow, bottlenecks, consistency, caching, partitioning, failure handling, security, observability, and explicit trade-offs as relevant to this particular design.
- Never turn the interview into a checklist.`;

    try {
        const text = await generateJSON(prompt);
        const decision = normalizeSystemDesignInterjection(JSON.parse(text || "{}"));
        // Answers to the candidate's clarification questions may legitimately restate earlier context.
        if (decision.shouldInterrupt && !candidateAskedQuestion && repeatsEarlierQuestion(decision.interjection, previousInterjections)) {
            recordGuardEvent("system_design", "repeat", "suppressed");
            return forceInteraction
                ? fallbackForcedInterjection({ previousInterjections, candidateAskedQuestion })
                : normalizeSystemDesignInterjection({ shouldInterrupt: false, reason: "repeated_interjection_suppressed" });
        }
        if (forceInteraction && !decision.shouldInterrupt) {
            return fallbackForcedInterjection({ previousInterjections, candidateAskedQuestion });
        }
        return decision;
    } catch {
        if (forceInteraction) return fallbackForcedInterjection({ previousInterjections, candidateAskedQuestion });
        return normalizeSystemDesignInterjection({ shouldInterrupt: false, reason: "interviewer_provider_unavailable" });
    }
};

export default generateSystemDesignInterjection;
