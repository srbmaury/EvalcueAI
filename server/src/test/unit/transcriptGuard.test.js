import { describe, expect, it } from "vitest";
import { looksGenerated, looksPromptDerived } from "../../utils/transcriptGuard.js";

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
});
