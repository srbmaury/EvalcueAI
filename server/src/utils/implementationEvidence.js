// Coding questions accept written answers, but a description is not an implementation. These checks let the
// evaluator tell "explained how they would build it" apart from "showed working code" without guessing.

const CODE_OBJECT = /\b(write|implement|code|build)\b[^.?]{0,60}\b(function|method|class|algorithm|program|query|snippet|data structure)\b/i;
const SERVICE_OBJECT = /\b(write|implement|code|build)\b[^.?]{0,60}\b(endpoint|api|service|handler|script|middleware|parser)\b/i;
const LANGUAGE = /\b(python|java|javascript|typescript|node(?:\.js)?|go(?:lang)?|c\+\+|c#|ruby|kotlin|rust|scala|php|swift|sql)\b/i;

export const asksForImplementation = (question = "") => {
    const text = String(question);
    return CODE_OBJECT.test(text) || (SERVICE_OBJECT.test(text) && LANGUAGE.test(text));
};

// Definitions, route registrations and SQL statements only appear in code, so one is enough. Semicolons,
// indentation and variable declarations can turn up in prose, so it takes two of those.
const STRONG_SIGNALS = [
    /\b(def|func|fn)\s+\w+\s*\(/,
    /\bfunction\s*\w*\s*\(/,
    /\bclass\s+\w+\s*[({:]/,
    /^\s*@\w+(\.\w+)*\(/m,
    /\b(const|let|var)\s+\w+\s*=\s*(async\s*)?\([^)]*\)\s*=>/,
    /\b(SELECT|INSERT|UPDATE|DELETE)\b[\s\S]{0,80}\b(FROM|INTO|SET|WHERE)\b/,
];
const WEAK_SIGNALS = [
    /\)\s*(=>|\{)/,
    /^\s*(import|from)\s+[\w.{]/m,
    /\b(const|let|var)\s+\w+\s*=/,
    /;\s*$/m,
    /^\s{2,}\S.*\n\s{2,}\S/m,
    /\breturn\s+[\w{[("']/,
];

export const containsCode = (answer = "") => {
    const text = String(answer);
    return STRONG_SIGNALS.some((pattern) => pattern.test(text)) || WEAK_SIGNALS.filter((pattern) => pattern.test(text)).length >= 2;
};

export const IMPLEMENTATION_SCORE_CAP = 6;
