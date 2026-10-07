import { describe, expect, it } from "vitest";
import { candidateQuestionIn } from "../useSystemDesignDiscussion";

describe("candidate question detection in the live design discussion", () => {
    it("finds a question asked before the candidate kept talking (observed live)", () => {
        const said = "First, what scale should I assume? I'll start with about 50k notifications per second at peak. Producers call a Notification API that validates and writes to a Kafka topic partitioned by user id; channel workers for push, email and SMS consume it, dedupe with an idempotency key in Redis, and retry with backoff into a dead-letter queue.";
        expect(candidateQuestionIn(said)).toBe("First, what scale should I assume?");
    });

    it("finds spoken questions without a question mark", () => {
        expect(candidateQuestionIn("Okay. Should I support group notifications as well")).toBe("Should I support group notifications as well");
    });

    it("ignores statements that merely contain question words", () => {
        expect(candidateQuestionIn("The gateway decides which worker handles the request, which keeps routing simple.")).toBe("");
        expect(candidateQuestionIn("")).toBe("");
    });
});
