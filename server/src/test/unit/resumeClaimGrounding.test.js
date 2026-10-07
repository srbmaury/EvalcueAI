import { beforeEach, describe, expect, it, vi } from "vitest";

const generateJSON = vi.fn();
vi.mock("../../utils/generateQuestions/aiClient.js", () => ({ generateJSON: (...args) => generateJSON(...args) }));

const { initializeAdaptiveInterviewState } = await import("../../services/adaptiveInterviewEngine.js");
const { claimGroundedIn } = await import("../../utils/generateQuestions/questionGuards.js");

// Observed live with no resume attached: the evidence plan came back with this claim, and the first
// question asked the candidate to defend it.
const INVENTED = "Designed a microservices architecture that improved system reliability by 30%.";
const RESUME = "Led an idempotent refund service in Go with Postgres and Redis, cutting duplicate refunds to zero.\nMigrated checkout to an event-driven design with Kafka, which cut latency by 40%.";

const plan = (claims) => JSON.stringify({
    competencies: [{ name: "Distributed System Design", weight: 1.2 }, { name: "Trade-off Evaluation", weight: 1 }, { name: "Reliability", weight: 1 }],
    resumeClaims: claims.map((claim) => ({ claim, topics: ["reliability"], probeAreas: ["design decisions"] })),
    initialDifficulty: 3,
    minQuestions: 2,
});

const init = (resumeText) => initializeAdaptiveInterviewState({
    jobRole: "Backend Engineer",
    jobDescription: "Design reliable APIs and distributed services.",
    roundName: "Distributed Systems and Scalability",
    roundDescription: "Discuss partitioning, load balancing, and fault tolerance.",
    resumeText,
});

describe("resume claim grounding", () => {
    beforeEach(() => { generateJSON.mockReset(); });

    it("drops every AI-proposed claim when the interview has no resume", async () => {
        generateJSON.mockResolvedValue(plan([INVENTED]));
        const state = await init("");
        expect(state.resumeClaims).toEqual([]);
    });

    it("keeps claims found in the resume and drops invented ones", async () => {
        generateJSON.mockResolvedValue(plan([INVENTED, "Migrated checkout to an event-driven Kafka design that cut latency by 40%"]));
        const state = await init(RESUME);
        expect(state.resumeClaims.map((item) => item.claim)).toEqual(["Migrated checkout to an event-driven Kafka design that cut latency by 40%"]);
    });

    it("rejects a paraphrase that changes the number", () => {
        expect(claimGroundedIn("Migrated checkout to Kafka, cutting latency by 60%", RESUME)).toBe(false);
        expect(claimGroundedIn("Built an idempotent refund service with Postgres and Redis", RESUME)).toBe(true);
        expect(claimGroundedIn("Built an idempotent refund service", "")).toBe(false);
    });
});
