import { describe, expect, it } from "vitest";
import { looksGenerated, looksLikeSilencePhrase, looksPromptDerived } from "../../utils/transcriptGuard.js";

const prompt = "Software engineering interview (Backend Engineer, Interview). Question: Can you elaborate on how you handle scenarios where the Idempotency-Key might be duplicated or lost? Terms: API, REST, Kafka, idempotency.";

describe("transcript guard", () => {
    it("flags a transcript that echoes the vocabulary hint", () => {
        // Observed live: silence or a steady tone with this hint came back as the question itself.
        expect(looksPromptDerived("Can you elaborate on how you handle scenarios where the Idempotency-Key might be duplicated or lost?", prompt)).toBe(true);
    });

    it("flags generated markdown answers", () => {
        expect(looksGenerated("Handling duplicated keys is crucial. 1. **Deduplication Mechanism**: store the key.")).toBe(true);
        expect(looksPromptDerived("- **Caching**: use Redis for responses", prompt)).toBe(true);
    });

    it("keeps real answers, including ones that reuse a few question words", () => {
        expect(looksPromptDerived("I store the key with a hash of the request body in Postgres and replay the saved response on retries", prompt)).toBe(false);
        expect(looksPromptDerived("If the key is lost the client just gets a new charge, so we make clients persist it before sending", prompt)).toBe(false);
        expect(looksPromptDerived("Yes.", prompt)).toBe(false);
        expect(looksPromptDerived("anything at all", "")).toBe(false);
    });

    it("flags stock phrases transcribed from silence, but only when that is the whole transcript", () => {
        // Observed live: a quiet room during a candidate turn came back as this refusal and was submitted.
        expect(looksLikeSilencePhrase("I'm sorry, but I can't provide that information.")).toBe(true);
        expect(looksLikeSilencePhrase("I’m sorry, I can’t assist with that.")).toBe(true);
        expect(looksLikeSilencePhrase("Thank you for watching!")).toBe(true);
        expect(looksLikeSilencePhrase("Subtitles by the Amara.org community")).toBe(true);
        expect(looksLikeSilencePhrase("you")).toBe(true);
        expect(looksLikeSilencePhrase("I'm sorry, I can't provide the exact numbers, but latency dropped after we added the cache.")).toBe(false);
        expect(looksLikeSilencePhrase("Thank you. So first I would clarify the read and write ratio.")).toBe(false);
        expect(looksLikeSilencePhrase("")).toBe(false);
    });
});
