import { beforeEach, describe, expect, it, vi } from "vitest";

const generateJSON = vi.fn();
vi.mock("../../utils/generateQuestions/aiClient.js", () => ({ generateJSON: (...args) => generateJSON(...args) }));

const { generateSystemDesignInterjection } = await import("../../services/systemDesignInterviewer.js");

// Observed live: the candidate asked "First, what scale should I assume?", then kept describing the design,
// and the interviewer moved on to failure handling without answering.
const TRANSCRIPT = "First, what scale should I assume? I'll start with about 50k notifications per second at peak. Producers call a Notification API that writes to a Kafka topic partitioned by user id; channel workers consume it and retry with backoff into a dead-letter queue.";

describe("system design clarification questions", () => {
    beforeEach(() => {
        generateJSON.mockReset();
        generateJSON.mockResolvedValue(JSON.stringify({ shouldInterrupt: true, interjection: "Plan for 2 million per second at peak; 50k is too low for this problem.", kind: "clarify", reason: "answered" }));
    });

    it("quotes the candidate's question and requires an answer that confirms or corrects their assumption", async () => {
        const result = await generateSystemDesignInterjection({
            problem: "Design a distributed notification service that can handle millions of notifications per second.",
            transcript: TRANSCRIPT,
            forceInteraction: true,
            candidateQuestion: "First, what scale should I assume?",
        });

        const prompt = generateJSON.mock.calls[0][0];
        expect(prompt).toContain('The candidate\'s question: "First, what scale should I assume?"');
        expect(prompt).toContain("clarification question: YES");
        expect(prompt).toMatch(/MUST start by ANSWERING/);
        expect(prompt).toMatch(/confirm it or correct it/);
        expect(result).toMatchObject({ shouldInterrupt: true, kind: "clarify" });
    });

    it("treats a supplied question as asked even if the flag was not set", async () => {
        await generateSystemDesignInterjection({ problem: "Design a cache.", transcript: TRANSCRIPT, forceInteraction: true, candidateAskedQuestion: false, candidateQuestion: "What read/write ratio should I plan for?" });
        expect(generateJSON.mock.calls[0][0]).toContain("clarification question: YES");
    });
});
