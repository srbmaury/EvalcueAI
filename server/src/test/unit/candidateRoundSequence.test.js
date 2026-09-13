import { describe, expect, it } from "vitest";
import { candidateRoundComplete, candidateRoundIndexForRequest } from "../../middleware/candidateRoundSequence.js";

describe("candidate round sequencing", () => {
    it("keeps adaptive live rounds open until the interviewer has enough evidence", () => {
        expect(candidateRoundComplete({
            deliveryMode: "conversational",
            adaptiveState: { enabled: true },
            adaptiveComplete: false,
            questions: [{ answer: "A complete first response" }],
        })).toBe(false);

        expect(candidateRoundComplete({
            deliveryMode: "conversational",
            adaptiveState: { enabled: true },
            adaptiveComplete: true,
            questions: [{ answer: "A complete first response" }],
        })).toBe(true);
    });

    it("requires every OA problem and pending follow-up before the round is complete", () => {
        expect(candidateRoundComplete({
            deliveryMode: "online-assessment",
            questions: [{ answer: "solution" }, { answer: "" }],
        })).toBe(false);

        expect(candidateRoundComplete({
            deliveryMode: "online-assessment",
            questions: [{ answer: "solution", followUpQuestion: "Complexity?", followUpAnswer: "" }],
        })).toBe(false);

        expect(candidateRoundComplete({
            deliveryMode: "online-assessment",
            questions: [{ answer: "solution", followUpQuestion: "Complexity?", followUpAnswer: "O(n)" }],
        })).toBe(true);
    });

    it("treats system design as one completed live discussion", () => {
        expect(candidateRoundComplete({ deliveryMode: "system-design", questions: [{ answer: "" }] })).toBe(false);
        expect(candidateRoundComplete({ deliveryMode: "system-design", questions: [{ answer: "Candidate design transcript" }] })).toBe(true);
    });

    it("resolves sequential round index from either request body or debugging route params", () => {
        expect(candidateRoundIndexForRequest({ body: { roundIndex: 2 }, params: { roundIndex: "4" } })).toBe(2);
        expect(candidateRoundIndexForRequest({ body: {}, params: { roundIndex: "3" } })).toBe(3);
        expect(Number.isNaN(candidateRoundIndexForRequest({ body: {}, params: {} }))).toBe(true);
    });
});
