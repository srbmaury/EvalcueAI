import { describe, expect, it } from "vitest";
import { fitsDeliveryMode, questionSimilarity, repeatsEarlierQuestion, unsupportedSpecifics } from "../../utils/generateQuestions/questionGuards.js";

describe("question guards", () => {
    it("flags numbers the candidate never stated", () => {
        const context = "Q: How do you scale APIs?\nA: I added Redis caching and cut p95 latency from 480ms to 120ms.";
        expect(unsupportedSpecifics("How did you measure your 50% reduction in latency?", context)).toEqual(["50%"]);
        expect(unsupportedSpecifics("How did you get from 480ms to 120ms?", context)).toEqual([]);
        expect(unsupportedSpecifics("What trade-offs did you consider?", context)).toEqual([]);
    });

    it("detects paraphrased repeats but not new probes", () => {
        const earlier = ["Can you explain how you measured the 50% reduction in response times?"];
        expect(repeatsEarlierQuestion("Can you explain how you measured the 50% reduction in response times and which metrics you tracked?", earlier)).toBe(true);
        expect(repeatsEarlierQuestion("How would you handle cache invalidation when prices change?", earlier)).toBe(false);
        expect(questionSimilarity("", "anything")).toBe(0);
    });

    it("keeps question formats aligned with the round", () => {
        expect(fitsDeliveryMode("Write a function in Python that returns two numbers adding up to a target.", "conversational")).toBe(false);
        expect(fitsDeliveryMode("How would you design a rate limiter for a public API?", "conversational")).toBe(true);
        expect(fitsDeliveryMode("Explain how you would manage state in a React app.", "online-assessment")).toBe(false);
        expect(fitsDeliveryMode("Implement a function that merges overlapping intervals.", "online-assessment")).toBe(true);
    });
});
