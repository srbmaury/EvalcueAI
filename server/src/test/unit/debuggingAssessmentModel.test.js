import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import Assessment from "../../models/Assessment.js";
import CandidateAttempt from "../../models/CandidateAttempt.js";

const baseAssessment = (round) => new Assessment({
    organization: new mongoose.Types.ObjectId(),
    createdBy: new mongoose.Types.ObjectId(),
    title: "Debugging assessment",
    jobRole: "Backend Engineer",
    jobDescription: "Debug a production-style failure and explain the root cause clearly.",
    shareToken: "debugging-share-token-1234567890",
    rounds: [round],
});

const debuggingRound = (overrides = {}) => ({
    name: "Debugging",
    description: "Find and fix the defect.",
    deliveryMode: "debugging",
    questionCount: 4,
    questions: [{ text: "Fix the implementation so all tests pass.", required: true }],
    debugging: {
        responseMode: "code_fix",
        language: "javascript",
        starterCode: "const solve = (value) => value + 1;",
        tests: [
            { name: "increments", stdin: "1", expectedOutput: "2", hidden: false },
            { name: "handles zero", stdin: "0", expectedOutput: "1", hidden: true },
        ],
    },
    ...overrides,
});

describe("debugging assessment model", () => {
    it("accepts a code-fix round and normalizes it to one assignment", async () => {
        const assessment = baseAssessment(debuggingRound());

        await assessment.validate();

        expect(assessment.rounds[0].deliveryMode).toBe("debugging");
        expect(assessment.rounds[0].questionCount).toBe(1);
        expect(assessment.rounds[0].questions).toHaveLength(1);
        expect(assessment.rounds[0].debugging.responseMode).toBe("code_fix");
        expect(assessment.rounds[0].debugging.tests).toHaveLength(2);
    });

    it("requires at least one test for code-fix mode", async () => {
        const assessment = baseAssessment(debuggingRound({
            debugging: {
                responseMode: "code_fix",
                language: "python",
                starterCode: "print(1)",
                tests: [],
            },
        }));

        await expect(assessment.validate()).rejects.toThrow(/test/i);
    });

    it("allows findings mode without executable tests", async () => {
        const assessment = baseAssessment(debuggingRound({
            debugging: {
                responseMode: "findings",
                language: "java",
                starterCode: "class OrderService {}",
                tests: [],
            },
        }));

        await expect(assessment.validate()).resolves.toBeUndefined();
    });

    it("rejects more than twelve debugging tests", async () => {
        const tests = Array.from({ length: 13 }, (_, index) => ({
            name: `test-${index}`,
            stdin: String(index),
            expectedOutput: String(index),
            hidden: index % 2 === 0,
        }));
        const assessment = baseAssessment(debuggingRound({
            debugging: {
                responseMode: "code_fix",
                language: "cpp",
                starterCode: "int main() { return 0; }",
                tests,
            },
        }));

        await expect(assessment.validate()).rejects.toThrow(/12|tests/i);
    });

    it("stores structured candidate debugging evidence", async () => {
        const attempt = new CandidateAttempt({
            assessment: new mongoose.Types.ObjectId(),
            candidateName: "Candidate",
            candidateEmail: "candidate@example.com",
            accessTokenHash: "hash",
            privacyConsentAt: new Date(),
            rounds: [{
                name: "Debugging",
                deliveryMode: "debugging",
                questions: [{
                    text: "Diagnose the duplicate charge.",
                    debugCode: "function charge() {}",
                    debugFindings: {
                        rootCause: "Non-atomic state transition",
                        evidence: "Two callers can observe pending state.",
                        proposedFix: "Use an idempotency key and atomic update.",
                        testingStrategy: "Add concurrent duplicate request coverage.",
                    },
                    debugTestResult: {
                        passed: 4,
                        total: 5,
                        visible: [{ name: "charges once", passed: true, output: "ok" }],
                        hiddenPassed: 2,
                        hiddenTotal: 3,
                        ranAt: new Date(),
                    },
                }],
            }],
        });

        await expect(attempt.validate()).resolves.toBeUndefined();
        expect(attempt.rounds[0].questions[0].debugFindings.rootCause).toContain("Non-atomic");
        expect(attempt.rounds[0].questions[0].debugTestResult.hiddenTotal).toBe(3);
    });
});
