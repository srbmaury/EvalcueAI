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
        runtime: "node-22",
        entryFile: "src/index.js",
        files: [
            { path: "src/index.js", content: "export const increment = (value) => value;", kind: "source" },
            { path: "tests/zero.test.js", content: "// recruiter test", kind: "hidden_test", displayName: "handles zero" },
        ],
    },
    ...overrides,
});

describe("debugging assessment model", () => {
    it("accepts a multi-file code-fix round and normalizes it to one assignment", async () => {
        const assessment = baseAssessment(debuggingRound());
        await assessment.validate();
        expect(assessment.rounds[0].deliveryMode).toBe("debugging");
        expect(assessment.rounds[0].questionCount).toBe(1);
        expect(assessment.rounds[0].questions).toHaveLength(1);
        expect(assessment.rounds[0].debugging.responseMode).toBe("code_fix");
        expect(assessment.rounds[0].debugging.runtime).toBe("node-22");
        expect(assessment.rounds[0].debugging.files[1].displayName).toBe("handles zero");
    });

    it("requires a hidden test file for code-fix mode", async () => {
        const assessment = baseAssessment(debuggingRound({ debugging: { responseMode: "code_fix", runtime: "python-3", files: [{ path: "app.py", content: "print(1)", kind: "source" }] } }));
        await expect(assessment.validate()).rejects.toThrow(/test/i);
    });

    it("allows findings mode with source files and no executable tests", async () => {
        const assessment = baseAssessment(debuggingRound({ debugging: { responseMode: "findings", runtime: "java-21", entryFile: "src/OrderService.java", files: [{ path: "src/OrderService.java", content: "class OrderService {}", kind: "source" }] } }));
        await expect(assessment.validate()).resolves.toBeUndefined();
    });

    it("rejects more than one hundred project files", async () => {
        const files = Array.from({ length: 101 }, (_, index) => ({ path: `src/file-${index}.js`, content: "export default 1;", kind: index === 100 ? "hidden_test" : "source", displayName: index === 100 ? "boundary" : "" }));
        const assessment = baseAssessment(debuggingRound({ debugging: { responseMode: "code_fix", runtime: "node-22", files } }));
        await expect(assessment.validate()).rejects.toThrow(/100|files/i);
    });

    it("stores project overlays and candidate-safe test evidence", async () => {
        const attempt = new CandidateAttempt({
            assessment: new mongoose.Types.ObjectId(), candidateName: "Candidate", candidateEmail: "candidate@example.com", accessTokenHash: "hash", privacyConsentAt: new Date(),
            rounds: [{ name: "Debugging", deliveryMode: "debugging", questions: [{ text: "Diagnose the duplicate charge." }] }],
            debuggingResponses: [{
                roundIndex: 0, responseMode: "code_fix", baseProjectFingerprint: "abc123",
                changedFiles: [{ path: "src/payment.js", content: "fixed" }], createdFiles: [{ path: "src/idempotency.js", content: "helper" }], deletedFiles: ["src/legacy.js"],
                testRuns: [{ status: "failed", passed: 4, total: 5, tests: [{ name: "charges once", passed: true }, { name: "blocks duplicate charge", passed: false }] }],
                finalEvaluation: { status: "passed", passed: 5, total: 5, tests: [{ name: "charges once", passed: true }], diff: { changed: 1, created: 1, deleted: 1 } },
            }],
        });
        await expect(attempt.validate()).resolves.toBeUndefined();
        expect(attempt.debuggingResponses[0].changedFiles[0].path).toBe("src/payment.js");
        expect(attempt.debuggingResponses[0].testRuns[0].total).toBe(5);
        expect(attempt.debuggingResponses[0].finalEvaluation.total).toBe(5);
    });

    it("stores multiple findings tied to project files", async () => {
        const attempt = new CandidateAttempt({
            assessment: new mongoose.Types.ObjectId(), candidateName: "Candidate", candidateEmail: "candidate@example.com", accessTokenHash: "hash", privacyConsentAt: new Date(),
            rounds: [{ name: "Debugging", deliveryMode: "debugging", questions: [{ text: "Find the bug." }] }],
            debuggingResponses: [{ roundIndex: 0, responseMode: "findings", findings: [{ filePath: "src/payment.js", rootCause: "Non-atomic transition", evidence: "Two callers observe pending state.", proposedFix: "Use an atomic conditional update." }] }],
        });
        await expect(attempt.validate()).resolves.toBeUndefined();
        expect(attempt.debuggingResponses[0].findings[0].filePath).toBe("src/payment.js");
        expect(attempt.debuggingResponses[0].findings[0].rootCause).toContain("Non-atomic");
    });
});
