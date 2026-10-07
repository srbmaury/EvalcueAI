// Classifies /api/questions requests so a live interview is never throttled by the budget meant for
// content generation. A single Practice round makes many small calls (autosave, answer turns, a
// system-design checkpoint every 7-15 s), which exhausted the 30-per-15-min AI limit mid-interview.
//
//   "none"       — no AI call (OA autosave); only the general API limiter applies.
//   "turn"       — one step of an interview already in progress; limited by its own, larger budget.
//   "generation" — creates new interview content; keeps the tight AI limit.
const NO_AI = /^\/[^/]+\/answers\/?$/;
const TURN = /^\/[^/]+\/(answer|follow-up-answer|complete|system-design\/checkpoint|system-design\/complete)\/?$/;

export const classifyQuestionRequest = (req) => {
    if (req.method !== "POST") return "generation";
    const path = req.path || "";
    if (NO_AI.test(path)) return "none";
    if (TURN.test(path)) return "turn";
    return "generation";
};

export const questionRouteLimiter = ({ turnLimiter, generationLimiter }) => (req, res, next) => {
    const kind = classifyQuestionRequest(req);
    if (kind === "none") return next();
    return (kind === "turn" ? turnLimiter : generationLimiter)(req, res, next);
};
