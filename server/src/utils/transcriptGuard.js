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

// On silence or room noise, transcription models also emit stock phrases that nobody said: refusals
// learned from chat data and caption boilerplate from video data. Only a transcript that is entirely one
// of these is dropped; a real answer that happens to contain "I'm sorry" or "thank you" is kept.
const SILENCE_PHRASES = [
    /^i'?m sorry,? (?:but )?i (?:can'?t|cannot) (?:provide|help|assist|share)(?: you)?(?: with)?(?: that| this)?(?: information| request)?$/,
    /^sorry,? i (?:can'?t|cannot) (?:help|assist)(?: you)?(?: with)?(?: that| this)?$/,
    /^(?:thank you|thanks)(?: so much| very much)?(?: for watching| for listening)?$/,
    /^(?:please )?(?:like and )?subscribe(?: to (?:my|the|our) channel)?$/,
    /^subtitles by .+$/,
    /^(?:you|bye|bye bye|okay|ok|hmm+|uh+|um+)$/,
];

const normalized = (text = "") => String(text).toLowerCase().replace(/[’`]/g, "'").replace(/[.!?,…]+\s*$/g, "").replace(/[.!?]+/g, " ").replace(/\s+/g, " ").trim();

export const looksLikeSilencePhrase = (text = "") => {
    const value = normalized(text);
    return Boolean(value) && SILENCE_PHRASES.some((pattern) => pattern.test(value));
};
