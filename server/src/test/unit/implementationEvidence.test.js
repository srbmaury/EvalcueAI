import { beforeEach, describe, expect, it, vi } from "vitest";

const generateJSON = vi.fn();
vi.mock("../../utils/generateQuestions/aiClient.js", () => ({ generateJSON: (...args) => generateJSON(...args) }));

const { asksForImplementation, containsCode } = await import("../../utils/implementationEvidence.js");
const { generateFeedbackForAnswer } = await import("../../utils/generateFeedback.js");

// Observed live: this prose answer scored 8/10 with Technical correctness 9/10.
const QUESTION = "Implement a RESTful API endpoint in Python that allows users to create, read, update, and delete items in a database. Ensure to handle errors and validate inputs efficiently.";
const PROSE = "I would implement CRUD endpoints with FastAPI and PostgreSQL. Pydantic validates inputs and rejects unknown fields. POST creates an item with a generated ID; GET returns 404 for missing records; PATCH updates only supplied fields; DELETE returns 204.";
const CODE = `from fastapi import FastAPI, HTTPException
app = FastAPI()

@app.get("/items/{item_id}")
def read_item(item_id: int):
    item = db.get(item_id)
    if not item:
        raise HTTPException(status_code=404)
    return item`;

describe("implementation evidence", () => {
    it("recognises questions that ask for code, and leaves design questions alone", () => {
        expect(asksForImplementation(QUESTION)).toBe(true);
        expect(asksForImplementation("Write a function that reverses a linked list.")).toBe(true);
        expect(asksForImplementation("How did you implement automated testing on your last team?")).toBe(false);
        expect(asksForImplementation("Design an API for a URL shortener and explain the trade-offs.")).toBe(false);
    });

    it("tells code apart from prose that mentions code", () => {
        expect(containsCode(CODE)).toBe(true);
        expect(containsCode("const total = items.reduce((sum, item) => sum + item.price, 0);")).toBe(true);
        expect(containsCode(PROSE)).toBe(false);
    });
});

describe("feedback for a coding question answered in prose", () => {
    beforeEach(() => {
        generateJSON.mockReset();
        generateJSON.mockResolvedValue(JSON.stringify({
            comment: "Solid overview.", score: 8, confidence: 0.8, suggestions: [], strengths: ["Clear CRUD plan"], gaps: [],
            dimensions: [{ name: "Technical correctness", score: 9, evidence: ["Correct status codes"] }],
            competencies: [], evidence: [],
        }));
    });

    it("caps the score, lowers confidence, and names the missing implementation", async () => {
        const result = await generateFeedbackForAnswer({ questionText: QUESTION, userAnswer: PROSE, audience: "candidate" });
        expect(result.score).toBe(6);
        expect(result.confidence).toBeLessThanOrEqual(0.6);
        expect(result.dimensions.find((item) => item.name === "Technical correctness").score).toBe(6);
        expect(result.gaps[0]).toMatch(/without code/);
        expect(generateJSON.mock.calls[0][0]).toMatch(/contains no code/);
    });

    it("does not cap an answer that includes code", async () => {
        const result = await generateFeedbackForAnswer({ questionText: QUESTION, userAnswer: `${PROSE}\n\n${CODE}`, audience: "candidate" });
        expect(result.score).toBe(8);
        expect(generateJSON.mock.calls[0][0]).not.toMatch(/contains no code/);
    });
});
