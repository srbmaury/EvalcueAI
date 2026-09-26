import { describe, expect, it } from "vitest";
import { limitedEvidence } from "../utils/evidenceStrength";

describe("limitedEvidence", () => {
    it("flags rounds built from very little candidate text", () => {
        expect(limitedEvidence(["I'd cache it."])).toBe(true);
        expect(limitedEvidence(["short one", "short two"])).toBe(true);
        expect(limitedEvidence([])).toBe(false);
    });

    it("does not flag rounds with substantial answers", () => {
        const long = "I would partition data by tenant, add read replicas, cache hot keys with explicit invalidation, and use a queue to absorb spikes. ".repeat(4);
        expect(limitedEvidence([long, long])).toBe(false);
    });
});
