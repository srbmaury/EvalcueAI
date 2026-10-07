import { describe, expect, it, vi } from "vitest";
import { classifyQuestionRequest, questionRouteLimiter } from "../../middleware/questionRouteLimits.js";

const req = (method, path) => ({ method, path });

describe("question route limits", () => {
    it("never applies an AI limit to OA autosave", () => {
        expect(classifyQuestionRequest(req("POST", "/abc123/answers"))).toBe("none");
    });

    it("treats steps of a running interview as turns", () => {
        for (const path of ["/r/answer", "/r/follow-up-answer", "/r/complete", "/r/system-design/checkpoint", "/r/system-design/complete"]) {
            expect(classifyQuestionRequest(req("POST", path))).toBe("turn");
        }
    });

    it("keeps content generation on the tight AI limit", () => {
        expect(classifyQuestionRequest(req("POST", "/i/rounds/r/prepare"))).toBe("generation");
        expect(classifyQuestionRequest(req("POST", "/r/clarify"))).toBe("generation");
        expect(classifyQuestionRequest(req("DELETE", "/i/rounds/r"))).toBe("generation");
    });

    it("routes each request to exactly one limiter", () => {
        const turnLimiter = vi.fn((_req, _res, next) => next());
        const generationLimiter = vi.fn((_req, _res, next) => next());
        const middleware = questionRouteLimiter({ turnLimiter, generationLimiter });
        const next = vi.fn();

        middleware(req("POST", "/r/answers"), {}, next);
        middleware(req("POST", "/r/system-design/checkpoint"), {}, next);
        middleware(req("POST", "/r/clarify"), {}, next);

        expect(turnLimiter).toHaveBeenCalledTimes(1);
        expect(generationLimiter).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledTimes(3);
    });
});
