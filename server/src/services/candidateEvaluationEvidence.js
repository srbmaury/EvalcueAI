import { followUpList } from "./followUps.js";

const clean = (value) => String(value || "").trim();

export const followUpEvidence = (item) => followUpList(item)
    .filter((followUp) => followUp?.question && followUp?.answer)
    .map((followUp, index) => `AI interviewer follow-up ${index + 1}: ${followUp.question}\nCandidate response ${index + 1}: ${followUp.answer}`)
    .join("\n\n");

export const interviewerDiscussionEvidence = (item) => {
    const turns = Array.isArray(item?.discussionTurns) ? item.discussionTurns : [];
    const interviewerTurns = turns
        .filter((turn) => turn?.speaker === "interviewer" && clean(turn.text))
        .map((turn) => `Interviewer: ${clean(turn.text)}`);
    return interviewerTurns.length ? ["Live interviewer prompts:", ...interviewerTurns].join("\n") : "";
};

export const buildCandidateEvaluationEvidence = ({ item, systemDesign = false, diagramContext = "" }) => {
    return [
        clean(item?.answer),
        systemDesign ? interviewerDiscussionEvidence(item) : "",
        clean(diagramContext),
        item?.spokenExplanation ? `Spoken explanation:\n${clean(item.spokenExplanation)}` : "",
        followUpEvidence(item),
    ].filter(Boolean).join("\n\n");
};

export default buildCandidateEvaluationEvidence;
