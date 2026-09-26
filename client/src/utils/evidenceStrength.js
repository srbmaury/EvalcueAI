// A round score built from very little candidate text is noisy. Flag it so readers weigh it accordingly.
export const MIN_EVIDENCE_WORDS = 80;

const wordCount = (text = "") => (String(text || "").match(/\S+/g) || []).length;

export const limitedEvidence = (texts = []) => {
    const answers = texts.map((text) => String(text || "").trim()).filter(Boolean);
    const words = answers.reduce((sum, text) => sum + wordCount(text), 0);
    return answers.length > 0 && (answers.length < 2 && words < MIN_EVIDENCE_WORDS * 2 || words < MIN_EVIDENCE_WORDS);
};
