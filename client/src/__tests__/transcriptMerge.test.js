import { describe, expect, it } from "vitest";
import { mergeTranscriptText } from "../utils/transcriptSanitizer";

describe("mergeTranscriptText", () => {
    it("does not duplicate a repeated final speech segment", () => {
        expect(mergeTranscriptText("I would use Redis", "Redis for caching"))
            .toBe("I would use Redis for caching");
    });

    it("ignores a final segment that was already committed", () => {
        expect(mergeTranscriptText("you", "you")).toBe("you");
    });

    it("keeps genuinely new speech", () => {
        expect(mergeTranscriptText("I would shard by user", "and replicate each shard"))
            .toBe("I would shard by user and replicate each shard");
    });
});
