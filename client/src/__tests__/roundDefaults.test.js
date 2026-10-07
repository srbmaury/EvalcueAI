import { describe, expect, it } from "vitest";
import { getDefaultQuestionLimit, getQuestionCountCopy, isSystemDesignRound, systemDesignDescription } from "../utils/roundDefaults";

describe("practice round defaults", () => {
    it("uses one evolving problem for system design", () => {
        const round = { roundName: "System Design", deliveryMode: "conversational", description: "Design a scalable service" };
        expect(isSystemDesignRound(round)).toBe(true);
        expect(getDefaultQuestionLimit(round)).toBe(1);
        expect(getQuestionCountCopy(round).label).toBe("Design problem");
    });

    it("uses two focused problems for online technical assessments", () => {
        const round = { roundName: "Coding & Problem Solving", deliveryMode: "online-assessment" };
        expect(getDefaultQuestionLimit(round)).toBe(2);
        expect(getQuestionCountCopy(round).label).toBe("Problems");
    });

    it("keeps behavioral conversations shorter because follow-ups are adaptive", () => {
        const round = { roundName: "Behavioral & Ownership", deliveryMode: "conversational" };
        expect(getDefaultQuestionLimit(round)).toBe(3);
        expect(getQuestionCountCopy(round).label).toBe("Starting questions");
    });

    it("uses four starting questions for technical conversations", () => {
        const round = { roundName: "Backend Deep Dive", deliveryMode: "conversational" };
        expect(getDefaultQuestionLimit(round)).toBe(4);
    });

    it("treats architecture rounds as live system-design discussions", () => {
        expect(getDefaultQuestionLimit({ roundName: "Frontend Architecture", deliveryMode: "conversational" })).toBe(1);
    });
});

describe("choosing live system design for a practice round", () => {
    it("marks the description so every layer treats the round as system design, within the API limit", () => {
        const description = systemDesignDescription("Discuss partitioning, load balancing, and fault tolerance.");
        expect(isSystemDesignRound({ roundName: "Distributed Systems and Scalability", description })).toBe(true);
        expect(getDefaultQuestionLimit({ roundName: "Distributed Systems and Scalability", description })).toBe(1);
        expect(systemDesignDescription("x".repeat(300))).toHaveLength(260);
    });
});
