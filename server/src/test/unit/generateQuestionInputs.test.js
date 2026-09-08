import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generateJSON: vi.fn(), getFetch: vi.fn() }));
vi.mock("../../utils/generateQuestions/aiClient.js", () => ({ generateJSON: mocks.generateJSON, getFetch: mocks.getFetch }));

import { getTechnicalTermsFromResume } from "../../utils/generateQuestions/aiExtraction.js";
import { extractRoundKeywords } from "../../utils/generateQuestions/roundKeywords.js";
import { webSearchReferenceQuestions } from "../../utils/generateQuestions/webGrounding.js";

describe("question-generation inputs", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.TAVILY_API_KEY;
        delete process.env.TAVILY_TIMEOUT_MS;
    });

    it("extracts, normalizes, filters, and deduplicates technical resume terms", async () => {
        mocks.generateJSON.mockResolvedValue(JSON.stringify({ technical: [" React ", "react", "Node.js", "project", "PostgreSQL", "not technical"] }));
        await expect(getTechnicalTermsFromResume({ resumeText: "Built React and Node.js services backed by PostgreSQL" }))
            .resolves.toEqual(["react", "node.js", "postgresql"]);
        expect(mocks.generateJSON).toHaveBeenCalledWith(expect.stringContaining("Built React and Node.js"));
    });

    it("handles alternate, malformed, and failed AI extraction responses", async () => {
        mocks.generateJSON.mockResolvedValueOnce(JSON.stringify({ topics: ["Docker", "Kubernetes"] }));
        await expect(getTechnicalTermsFromResume({ resumeText: "Docker and Kubernetes" })).resolves.toEqual(["docker", "kubernetes"]);
        mocks.generateJSON.mockResolvedValueOnce("not-json");
        await expect(getTechnicalTermsFromResume({ resumeText: "Java" })).resolves.toEqual([]);
        mocks.generateJSON.mockRejectedValueOnce(new Error("AI unavailable"));
        await expect(getTechnicalTermsFromResume({ resumeText: "Java" })).resolves.toEqual([]);
    });

    it("adds domain vocabularies for coding, system design, and behavioral rounds", () => {
        const coding = extractRoundKeywords("Coding round", "Algorithms and data structures");
        expect([...coding]).toEqual(expect.arrayContaining(["dsa", "dynamic programming", "sliding window", "complexity"]));
        const design = extractRoundKeywords("System design", "Distributed scalable architecture");
        expect([...design]).toEqual(expect.arrayContaining(["system design", "availability", "load balancing", "sharding"]));
        const behavioral = extractRoundKeywords("Manager behavioral", "Leadership and communication");
        expect([...behavioral]).toEqual(expect.arrayContaining(["behavioral", "ownership", "stakeholder", "conflict"]));
    });

    it("skips web grounding without a key", async () => {
        await expect(webSearchReferenceQuestions(new Set(["java"]), "Engineer", "Technical")).resolves.toEqual([]);
        expect(mocks.getFetch).not.toHaveBeenCalled();
    });

    it("collects question-like search snippets and removes duplicates", async () => {
        process.env.TAVILY_API_KEY = "test-key";
        const fetch = vi.fn()
            .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [{ content: "What is dependency injection? Explain inversion of control. This is not a question statement." }] }) })
            .mockResolvedValueOnce({ ok: false });
        mocks.getFetch.mockResolvedValue(fetch);
        const result = await webSearchReferenceQuestions(new Set(["Spring", "Java"]), "Backend Engineer", "Technical");
        expect(result).toEqual(["What is dependency injection?", "Explain inversion of control?"]);
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ api_key: "test-key", search_depth: "basic", max_results: 5 });
    });

    it("returns no web references when the provider fails", async () => {
        process.env.TAVILY_API_KEY = "test-key";
        mocks.getFetch.mockRejectedValue(new Error("network unavailable"));
        await expect(webSearchReferenceQuestions(new Set(["Java"]), "Engineer", "Technical")).resolves.toEqual([]);
    });
});
