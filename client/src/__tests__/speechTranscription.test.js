import { describe, expect, it } from "vitest";
import { buildTranscriptionHint, recognitionLanguage, replaceLastOccurrence, transcriptsDiffer } from "../utils/speechTranscription";

describe("speech transcription helpers", () => {
    it("recognizes speech in the user's own English locale", () => {
        expect(recognitionLanguage(["en-IN", "hi-IN"])).toBe("en-IN");
        expect(recognitionLanguage(["hi-IN", "en-gb"])).toBe("en-GB");
        expect(recognitionLanguage(["fr-FR"])).toBe("en-US");
        expect(recognitionLanguage(["en"])).toBe("en-US");
    });

    it("builds a glossary from the role and the question's technical terms, never the question itself", () => {
        const question = "How would you handle a duplicated Idempotency-Key when PostgreSQL and gRPC calls time out?";
        const hint = buildTranscriptionHint({ role: "Backend Engineer", question });
        expect(hint.startsWith("Glossary: Backend Engineer, Idempotency-Key, PostgreSQL")).toBe(true);
        expect(hint).toContain("idempotency");
        expect(hint).not.toContain("How would you");
        expect(hint).not.toContain("?");
        expect(hint.length).toBeLessThanOrEqual(800);
    });

    it("corrects only the most recent copy of the live text", () => {
        expect(replaceLastOccurrence("use radis. then radis again", "radis again", "Redis again")).toBe("use radis. then Redis again");
        expect(replaceLastOccurrence("already edited answer", "radis", "Redis")).toBe("already edited answer");
    });

    it("ignores case and punctuation differences", () => {
        expect(transcriptsDiffer("Use Redis.", "use redis")).toBe(false);
        expect(transcriptsDiffer("item potency keys", "idempotency keys")).toBe(true);
    });
});
