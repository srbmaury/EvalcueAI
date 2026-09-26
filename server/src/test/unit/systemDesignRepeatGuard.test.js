import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../utils/generateQuestions/aiClient.js", () => ({ generateJSON: vi.fn() }));

import { generateJSON } from "../../utils/generateQuestions/aiClient.js";
import { generateSystemDesignInterjection } from "../../services/systemDesignInterviewer.js";

const transcript = "Clients send an idempotency key; the API writes the payment and an outbox row in one PostgreSQL transaction and a relay publishes to Kafka.";
// Real pair from a live session: the second re-asks the first in different words.
const earlier = ["How would you ensure that the user is notified of the transaction status if a failure occurs after the payment is processed?"];
const repeat = "How would you implement a mechanism to ensure that users receive a confirmation or notification of their transaction status in the event of a failure after processing?";
const reply = (interjection) => JSON.stringify({ shouldInterrupt: true, interjection, kind: "failure", reason: "probe" });

describe("system design interjection repeats", () => {
    beforeEach(() => vi.clearAllMocks());

    it("stays silent instead of re-asking an earlier probe in new words", async () => {
        generateJSON.mockResolvedValue(reply(repeat));
        const result = await generateSystemDesignInterjection({ problem: "Design a payment API", transcript, previousInterjections: earlier });
        expect(result.shouldInterrupt).toBe(false);
    });

    it("falls back to a different scripted probe when a turn is required", async () => {
        generateJSON.mockResolvedValue(reply(repeat));
        const result = await generateSystemDesignInterjection({ problem: "Design a payment API", transcript, previousInterjections: earlier, forceInteraction: true });
        expect(result.shouldInterrupt).toBe(true);
        expect(result.interjection).not.toBe(repeat);
    });

    it("keeps new probes", async () => {
        generateJSON.mockResolvedValue(reply("How would you partition the payments table once one primary cannot keep up?"));
        const result = await generateSystemDesignInterjection({ problem: "Design a payment API", transcript, previousInterjections: earlier });
        expect(result).toMatchObject({ shouldInterrupt: true, interjection: "How would you partition the payments table once one primary cannot keep up?" });
    });
});
