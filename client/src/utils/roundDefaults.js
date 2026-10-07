const roundText = (round = {}) => `${round.roundName || ""} ${round.description || ""} ${(round.skills || []).join(" ")}`.toLowerCase();

export const isSystemDesignRound = (round = {}) => /system\s*design|architecture/.test(roundText(round));

// Value for the "Live system design" choice in the round format menu (see systemDesignDescription).
export const SYSTEM_DESIGN_FORMAT = "system-design";

// Rounds are system design when their name or description says so, so a round the candidate switches to
// live system design gets a marked description. The API caps descriptions at 260 characters.
export const systemDesignDescription = (description = "") => `Live system design: ${String(description).trim()}`.slice(0, 260);

export const isBehavioralRound = (round = {}) => /recruiter|screen|behavior|culture|hiring manager|leadership|ownership|collaboration/.test(roundText(round));

export const getDefaultQuestionLimit = (round = {}) => {
    const mode = round.deliveryMode || "conversational";

    if (isSystemDesignRound(round)) return 1;
    if (mode === "online-assessment") return 2;
    if (isBehavioralRound(round)) return 3;
    return 4;
};

export const getQuestionCountCopy = (round = {}) => {
    if (isSystemDesignRound(round)) {
        return {
            label: "Design problem",
            helper: "One evolving architecture problem, discussed live with the AI interviewer.",
        };
    }
    if ((round.deliveryMode || "conversational") === "online-assessment") {
        return {
            label: "Problems",
            helper: "Two focused problems is the default for a realistic technical assessment. Adjust if needed.",
        };
    }
    return {
        label: "Starting questions",
        helper: "The interviewer can ask adaptive follow-ups, so fewer strong starting questions create a more natural conversation.",
    };
};

export default getDefaultQuestionLimit;
