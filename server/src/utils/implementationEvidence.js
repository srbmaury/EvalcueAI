// Coding questions accept written answers, but a description is not an implementation. These checks let the
// evaluator tell "explained how they would build it" apart from "showed working code" without guessing.

const CODE_OBJECT = /\b(write|implement|code|build)\b[^.?]{0,60}\b(function|method|class|algorithm|program|query|snippet|data structure)\b/i;
const SERVICE_OBJECT = /\b(write|implement|code|build)\b[^.?]{0,60}\b(endpoint|api|service|handler|script|middleware|parser)\b/i;
const LANGUAGE = /\b(python|java|javascript|typescript|node(?:\.js)?|go(?:lang)?|c\+\+|c#|ruby|kotlin|rust|scala|php|swift|sql)\b/i;

export const asksForImplementation = (question = "") => {
    const text = String(question);
    return CODE_OBJECT.test(text) || (SERVICE_OBJECT.test(text) && LANGUAGE.test(text));
};

// Signals that only appear in code, never in ordinary prose: definitions, arrows, braces opening a block,
// statement-ending semicolons, decorators/route registrations and import lines.
const CODE_SIGNALS = [
    /\b(def|func|fn)\s+\w+\s*\(/,
    /\bfunction\s*\w*\s*\(/,
    /\)\s*(=>|\{)/,
    /\bclass\s+\w+\s*[({:]/,
    /^\s*(import|from)\s+[\w.{]/m,
    /^\s*@\w+(\.\w+)*\(/m,
    /\b(const|let|var)\s+\w+\s*=/,
    /;\s*$/m,
    /^\s{2,}\S.*\n\s{2,}\S/m,
    /\b(SELECT|INSERT|UPDATE|DELETE)\b[\s\S]{0,80}\b(FROM|INTO|SET|WHERE)\b/,
];

export const containsCode = (answer = "") => {
    const text = String(answer);
    return CODE_SIGNALS.filter((pattern) => pattern.test(text)).length >= 2;
};

export const IMPLEMENTATION_SCORE_CAP = 6;
