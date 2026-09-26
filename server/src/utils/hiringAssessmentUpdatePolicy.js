export const editableAssessmentFields = [
    "title",
    "jobRole",
    "jobDescription",
    "followUpsEnabled",
    "askCandidateIntro",
    "inviteOnly",
    "candidateInstructions",
    "contactEmail",
    "durationMinutes",
    "opensAt",
    "expiresAt",
    "timezone",
    "integrity",
    "rubric",
    "templateName",
    "rounds",
];

export const hasEditableAssessmentContent = (body = {}) => editableAssessmentFields.some((key) => body[key] !== undefined);

const transitions = {
    draft: ["scheduled", "active", "archived"],
    scheduled: ["draft", "active", "closed", "archived"],
    active: ["closed", "archived"],
    closed: ["active", "archived"],
    archived: [],
};

export const canTransitionAssessmentStatus = (currentStatus, nextStatus) => currentStatus === nextStatus || Boolean(transitions[currentStatus]?.includes(nextStatus));

export const applyEditableAssessmentFields = (assessment, body = {}) => {
    for (const key of editableAssessmentFields) {
        if (body[key] === undefined) continue;
        if (["opensAt", "expiresAt"].includes(key) && (body[key] === null || body[key] === "")) assessment[key] = undefined;
        else assessment[key] = body[key];
    }
    return assessment;
};
