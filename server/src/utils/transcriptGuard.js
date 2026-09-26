// Transcription models given a vocabulary prompt sometimes return the prompt itself, or an answer to the
// question in it, when the audio has no speech (silence, noise, a steady tone). Neither must ever be
// recorded as something the candidate said.

const words = (text = "") => String(text).toLowerCase().match(/[\p{L}\p{N}']+/gu) || [];

// Speech never produces markdown; generated answers often do.
const MARKDOWN = /\*\*[^*]+\*\*|^\s{0,3}#{1,3}\s|^\s*[-*]\s+\*\*/m;

const PROMPT_SHARE = 0.7;
const MIN_WORDS = 4;

export const looksGenerated = (text = "") => MARKDOWN.test(String(text));

export const looksPromptDerived = (text = "", prompt = "") => {
    if (looksGenerated(text)) return true;
    const said = words(text);
    if (!prompt || said.length < MIN_WORDS) return false;
    const promptWords = new Set(words(prompt));
    const shared = said.filter((word) => promptWords.has(word)).length;
    return shared / said.length >= PROMPT_SHARE;
};
