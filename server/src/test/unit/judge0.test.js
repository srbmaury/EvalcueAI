import { describe, expect, it } from "vitest";
import { buildJudge0SubmissionUrl } from "../../utils/judge0.js";

describe("Judge0 submission URL", () => {
    it("requests a synchronous non-base64 result", () => {
        expect(buildJudge0SubmissionUrl("https://judge0-ce.p.rapidapi.com/submissions"))
            .toBe("https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=false&wait=true");
    });

    it("preserves existing query parameters", () => {
        expect(buildJudge0SubmissionUrl("https://judge0.example/submissions?foo=bar"))
            .toBe("https://judge0.example/submissions?foo=bar&base64_encoded=false&wait=true");
    });
});
