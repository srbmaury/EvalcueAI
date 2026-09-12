import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";

const runDebuggingTests = vi.fn();
vi.mock("../../services/debuggingTestRunner.js", () => ({ runDebuggingTests }));

const { default: app } = await import("../../app.js");
const { default: connectDB } = await import("../../config/db.js");
const { default: User } = await import("../../models/User.js");
const { signAccessToken } = await import("../../utils/tokens.js");

let replset;
let agent;
let owner;
let organizationId;
let ownerAuth;

const origin = "http://localhost:5000";
const write = (req, auth = {}) => req.set(auth).set("origin", origin).set("referer", `${origin}/`);
const authFor = (user, orgId) => ({
    Authorization: `Bearer ${signAccessToken(user._id, user.tokenVersion)}`,
    ...(orgId ? { "X-Organization-Id": String(orgId) } : {}),
});

const debuggingRound = ({ responseMode = "code_fix", title = "Fix duplicate charging" } = {}) => ({
    name: "Debugging",
    description: "Diagnose the production defect.",
    deliveryMode: "debugging",
    questionCount: 1,
    questions: [{ text: title, required: true }],
    debugging: {
        responseMode,
        language: "javascript",
        starterCode: "const solve = (value) => value + 1;\nconsole.log(solve(Number(require('fs').readFileSync(0, 'utf8'))));",
        tests: responseMode === "code_fix" ? [
            { name: "increments one", stdin: "1", expectedOutput: "2", hidden: false },
            { name: "secret boundary", stdin: "41", expectedOutput: "42-SECRET", hidden: true },
        ] : [],
    },
});

const assessmentInput = (round, overrides = {}) => ({
    title: "Debugging screen",
    jobRole: "Backend Engineer",
    jobDescription: "Debug production services safely and explain root causes.",
    status: "active",
    durationMinutes: 45,
    rounds: [round],
    ...overrides,
});

const startCandidate = async (shareToken, email = "candidate@example.com") => write(
    agent.post(`/api/assessments/public/${shareToken}/start`),
).send({ name: "Candidate", email, privacyConsent: true }).expect(201);

describe("debugging assessment API", () => {
    beforeAll(async () => {
        replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
        process.env.MONGO_URI = replset.getUri();
        process.env.NODE_ENV = "test";
        process.env.MONGO_TLS = "false";
        process.env.MONGO_REQUIRE_TRANSACTIONS = "false";
        process.env.TEST_FORCE_GENERATOR_EMPTY = "true";
        process.env.ENABLE_CODE_EXEC = "true";
        process.env.ENABLE_DEBUGGING_ASSESSMENTS = "false";
        await connectDB();
        agent = request.agent(app);
        owner = await User.create({ name: "Debug Owner", email: "debug-owner@example.com", password: "Passw0rd!", isVerified: true });
        const organization = await write(agent.post("/api/organizations"), authFor(owner))
            .send({ name: "Debugging Labs" })
            .expect(201);
        organizationId = organization.body.organization._id;
        ownerAuth = authFor(owner, organizationId);
    }, 60000);

    beforeEach(() => {
        vi.clearAllMocks();
        runDebuggingTests.mockResolvedValue({
            passed: 1,
            total: 2,
            visible: [{ name: "increments one", passed: true, output: "2\n" }],
            hiddenPassed: 0,
            hiddenTotal: 1,
        });
    });

    afterAll(async () => {
        delete process.env.ENABLE_DEBUGGING_ASSESSMENTS;
        try { await mongoose.connection.close(); } catch {}
        if (replset) await replset.stop();
    }, 30000);

    it("keeps debugging rounds unavailable when the feature flag is off", async () => {
        process.env.ENABLE_DEBUGGING_ASSESSMENTS = "false";

        const capabilities = await agent.get("/api/assessments/capabilities").set(ownerAuth).expect(200);
        expect(capabilities.body).toEqual({ debuggingAssessments: false });

        const response = await write(agent.post("/api/assessments"), ownerAuth)
            .send(assessmentInput(debuggingRound()))
            .expect(503);
        expect(response.body.message).toMatch(/feature disabled/i);
    });

    it("publishes only safe debugging configuration and initializes candidate code", async () => {
        process.env.ENABLE_DEBUGGING_ASSESSMENTS = "true";

        const capabilities = await agent.get("/api/assessments/capabilities").set(ownerAuth).expect(200);
        expect(capabilities.body).toEqual({ debuggingAssessments: true });

        const created = await write(agent.post("/api/assessments"), ownerAuth)
            .send(assessmentInput(debuggingRound()))
            .expect(201);

        const publicResponse = await agent.get(`/api/assessments/public/${created.body.shareToken}`).expect(200);
        expect(publicResponse.body.capabilities.debuggingAssessments).toBe(true);
        expect(publicResponse.body.rounds[0].debugging).toMatchObject({
            responseMode: "code_fix",
            language: "javascript",
            visibleTestCount: 1,
            hiddenTestCount: 1,
        });
        expect(publicResponse.body.rounds[0].debugging.starterCode).toContain("const solve");
        expect(JSON.stringify(publicResponse.body)).not.toContain("42-SECRET");
        expect(JSON.stringify(publicResponse.body)).not.toContain("secret boundary");

        const started = await startCandidate(created.body.shareToken);
        expect(started.body.attempt.rounds[0].deliveryMode).toBe("debugging");
        expect(started.body.attempt.rounds[0].questions[0].debugCode).toContain("const solve");
        expect(JSON.stringify(started.body)).not.toContain("42-SECRET");
    });

    it("runs recruiter-authored tests without exposing hidden definitions", async () => {
        process.env.ENABLE_DEBUGGING_ASSESSMENTS = "true";
        const created = await write(agent.post("/api/assessments"), ownerAuth)
            .send(assessmentInput(debuggingRound(), { title: "Runner screen" }))
            .expect(201);
        const started = await startCandidate(created.body.shareToken, "runner@example.com");
        const attemptId = started.body.attempt._id;
        const attemptToken = started.body.attemptToken;
        const candidateCode = "console.log(Number(require('fs').readFileSync(0, 'utf8')) + 1);";

        const response = await write(agent.post(`/api/assessments/public/${created.body.shareToken}/attempts/${attemptId}/debugging/run-tests`))
            .set("x-attempt-token", attemptToken)
            .send({ roundIndex: 0, questionIndex: 0, code: candidateCode })
            .expect(200);

        expect(runDebuggingTests).toHaveBeenCalledWith(expect.objectContaining({
            language: "javascript",
            code: candidateCode,
            tests: expect.arrayContaining([expect.objectContaining({ expectedOutput: "42-SECRET", hidden: true })]),
        }));
        expect(response.body).toMatchObject({ passed: 1, total: 2, hiddenPassed: 0, hiddenTotal: 1 });
        expect(JSON.stringify(response.body)).not.toContain("42-SECRET");
        expect(JSON.stringify(response.body)).not.toContain("secret boundary");
    });

    it("enforces response mode when saving candidate debugging work", async () => {
        process.env.ENABLE_DEBUGGING_ASSESSMENTS = "true";
        const findingsAssessment = await write(agent.post("/api/assessments"), ownerAuth)
            .send(assessmentInput(debuggingRound({ responseMode: "findings", title: "Explain the race condition." }), { title: "Findings screen" }))
            .expect(201);
        const findingsStarted = await startCandidate(findingsAssessment.body.shareToken, "findings@example.com");
        const attemptId = findingsStarted.body.attempt._id;
        const attemptToken = findingsStarted.body.attemptToken;

        const saved = await write(agent.put(`/api/assessments/public/${findingsAssessment.body.shareToken}/attempts/${attemptId}/debugging`))
            .set("x-attempt-token", attemptToken)
            .send({
                roundIndex: 0,
                questionIndex: 0,
                findings: {
                    rootCause: "A read-modify-write race allows duplicate charges.",
                    evidence: "Both requests observe pending before either update commits.",
                    proposedFix: "Use an idempotency key and conditional atomic update.",
                    testingStrategy: "Run concurrent duplicate requests and verify one charge.",
                },
            })
            .expect(200);
        expect(saved.body.rounds[0].questions[0].debugFindings.rootCause).toMatch(/race/);

        await write(agent.post(`/api/assessments/public/${findingsAssessment.body.shareToken}/attempts/${attemptId}/debugging/run-tests`))
            .set("x-attempt-token", attemptToken)
            .send({ roundIndex: 0, questionIndex: 0, code: "console.log('should not run')" })
            .expect(409);
        expect(runDebuggingTests).not.toHaveBeenCalled();
    });
});
