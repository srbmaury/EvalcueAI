import { describe, expect, it } from "vitest";
import { composeLiveTranscript } from "../hooks/useVoiceInput";
import { sanitizeTranscriptSegment } from "../utils/transcriptSanitizer";

describe("voice transcript composition", () => {
    it("keeps the unfinished interim phrase when recording stops", () => {
        expect(composeLiveTranscript("The final part", "and the words still being recognized")).toBe(
            "The final part and the words still being recognized",
        );
    });

    it("handles browsers that only provide interim speech", () => {
        expect(composeLiveTranscript("", "populate this answer")).toBe("populate this answer");
    });

    it("drops common silent-STT outro hallucinations", () => {
        expect(sanitizeTranscriptSegment("Thank you for watching. Thank you for watching. Thanks for watching and don't forget to like and subscribe!")).toBe("");
        expect(sanitizeTranscriptSegment("Thanks for watching!" )).toBe("");
    });

    it("keeps real interview answers even when they are short", () => {
        expect(sanitizeTranscriptSegment("I would add retries with jitter and idempotency keys.")).toBe("I would add retries with jitter and idempotency keys.");
    });
});
