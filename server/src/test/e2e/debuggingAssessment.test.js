import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";

const { runDebuggingProject } = vi.hoisted(() => ({ runDebuggingProject: vi.fn() }));
vi.mock("../../services/debuggingProjectRunner.js", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, runDebuggingProject };
});

// HIRING_PLAN_LIMITS is frozen at module import time, so this must be set before app.js
// (which transitively imports hiringEntitlements.js) is imported below. This file's
// single shared organization starts several candidates across its test cases, more than
// the default trial cap of 5.
process.env.HIRING_TRIAL_CANDIDATE_INTERVIEWS = "50";
// The code runner is an external service; report every runtime as executable.
vi.mock("../../services/codeRunner.js", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, availableRuntimeIds: async () => ["node-22", "python-3", "java-21", "cpp-20"] };
});

const { default: app } = await import("../../app.js");
const { default: connectDB } = await import("../../config/db.js");
const { default: User } = await import("../../models/User.js");
const { default: CandidateAttempt } = await import("../../models/CandidateAttempt.js");
const { signAccessToken } = await import("../../utils/tokens.js");

let replset;
let agent;
let owner;
let organizationId;
let ownerAuth;
const origin = "http://localhost:5000";
const write = (req, auth = {}) => req.set(auth).set("origin", origin).set("referer", `${origin}/`);
const authFor = (user, orgId) => ({ Authorization: `Bearer ${signAccessToken(user._id, user.tokenVersion)}`, ...(orgId ? { "X-Organization-Id": String(orgId) } : {}) });

const projectFiles = () => [
    { path: "src/index.js", content: "export const increment = (value) => value;", kind: "source" },
    { path: "tests/boundary.test.js", content: "INTERNAL_ASSERTION", kind: "hidden_test", displayName: "handles boundary values" },
];
const debuggingRound = ({ responseMode = "code_fix", title = "Fix duplicate charging" } = {}) => ({
    name: "Debugging",
    description: "Diagnose the production defect.",
    deliveryMode: "debugging",
    questionCount: 1,
    questions: [{ text: title, required: true }],
    debugging: { responseMode, runtime: "node-22", entryFile: "src/index.js", files: responseMode === "code_fix" ? projectFiles() : projectFiles().filter((file) => file.kind === "source") },
});
const assessmentInput = (round, overrides = {}) => ({ title: "Debugging screen", jobRole: "Backend Engineer", jobDescription: "Debug production services safely and explain root causes.", status: "active", durationMinutes: 45, rounds: [round], ...overrides });
const startCandidate = async (shareToken, email = "candidate@example.com") => write(agent.post(`/api/assessments/public/${shareToken}/start`)).send({ name: "Candidate", email, privacyConsent: true }).expect(201);

const failingStarter = { status: "failed", passed: 0, total: 1, tests: [{ name: "handles boundary values", passed: false }] };

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
        const organization = await write(agent.post("/api/organizations"), authFor(owner)).send({ name: "Debugging Labs" }).expect(201);
        organizationId = organization.body.organization._id;
        ownerAuth = authFor(owner, organizationId);
    }, 60000);

    beforeEach(() => {
        vi.clearAllMocks();
        runDebuggingProject.mockResolvedValue(failingStarter);
    });

    afterAll(async () => {
        delete process.env.ENABLE_DEBUGGING_ASSESSMENTS;
        try { await mongoose.connection.close(); } catch {}
        if (replset) await replset.stop();
    }, 30000);

    it("keeps debugging rounds unavailable when the feature flag is off", async () => {
        process.env.ENABLE_DEBUGGING_ASSESSMENTS = "false";
        const capabilities = await agent.get("/api/assessments/capabilities").set(ownerAuth).expect(200);
        expect(capabilities.body.debuggingAssessments).toBe(false);
        expect(capabilities.body.debuggingRuntimes).toEqual([]);
        const response = await write(agent.post("/api/assessments"), ownerAuth).send(assessmentInput(debuggingRound())).expect(503);
        expect(response.body.message).toMatch(/feature disabled/i);
    });

    it("publishes safe metadata and keeps recruiter tests behind the attempt boundary", async () => {
        process.env.ENABLE_DEBUGGING_ASSESSMENTS = "true";
        const capabilities = await agent.get("/api/assessments/capabilities").set(ownerAuth).expect(200);
        expect(capabilities.body.debuggingAssessments).toBe(true);
        expect(capabilities.body.debuggingRuntimes.map((item) => item.runtime)).toContain("node-22");

        const created = await write(agent.post("/api/assessments"), ownerAuth).send(assessmentInput(debuggingRound())).expect(201);
        const publicResponse = await agent.get(`/api/assessments/public/${created.body.shareToken}`).expect(200);
        expect(publicResponse.body.rounds[0].debugging).toMatchObject({ responseMode: "code_fix", runtime: "node-22", sourceFileCount: 1, hiddenTestCount: 1 });
        expect(JSON.stringify(publicResponse.body)).not.toContain("INTERNAL_ASSERTION");
        expect(JSON.stringify(publicResponse.body)).not.toContain("tests/boundary.test.js");

        const started = await startCandidate(created.body.shareToken);
        const workspace = await agent.get(`/api/assessments/public/${created.body.shareToken}/attempts/${started.body.attempt._id}/debugging/0`).set("x-attempt-token", started.body.attemptToken).expect(200);
        expect(workspace.body.files.map((file) => file.path)).toEqual(["src/index.js"]);
        expect(JSON.stringify(workspace.body)).not.toContain("tests/boundary.test.js");
        expect(JSON.stringify(workspace.body)).not.toContain("INTERNAL_ASSERTION");
    });

    it("autosaves an overlay and runs recruiter tests with safe display names", async () => {
        process.env.ENABLE_DEBUGGING_ASSESSMENTS = "true";
        const created = await write(agent.post("/api/assessments"), ownerAuth).send(assessmentInput(debuggingRound(), { title: "Runner screen" })).expect(201);
        const started = await startCandidate(created.body.shareToken, "runner@example.com");
        const base = `/api/assessments/public/${created.body.shareToken}/attempts/${started.body.attempt._id}/debugging/0`;

        await write(agent.put(`${base}/workspace`)).set("x-attempt-token", started.body.attemptToken).send({ changedFiles: [{ path: "src/index.js", content: "export const increment = (value) => value + 1;" }], createdFiles: [], deletedFiles: [] }).expect(200);

        runDebuggingProject.mockResolvedValueOnce({ status: "passed", passed: 1, total: 1, tests: [{ name: "handles boundary values", passed: true }] });
        const run = await write(agent.post(`${base}/run-tests`)).set("x-attempt-token", started.body.attemptToken).send({}).expect(200);
        expect(run.body).toEqual({ status: "passed", passed: 1, total: 1, tests: [{ name: "handles boundary values", passed: true }] });
        expect(runDebuggingProject).toHaveBeenLastCalledWith(expect.objectContaining({ files: expect.arrayContaining([expect.objectContaining({ path: "tests/boundary.test.js", content: "INTERNAL_ASSERTION" })]) }));
        expect(JSON.stringify(run.body)).not.toMatch(/boundary\.test\.js|INTERNAL_ASSERTION/i);
    });

    it("keeps autosaves that overlap a slow test run from failing and preserves both writes", async () => {
        process.env.ENABLE_DEBUGGING_ASSESSMENTS = "true";
        const created = await write(agent.post("/api/assessments"), ownerAuth).send(assessmentInput(debuggingRound(), { title: "Concurrency screen" })).expect(201);
        const started = await startCandidate(created.body.shareToken, "concurrency@example.com");
        const base = `/api/assessments/public/${created.body.shareToken}/attempts/${started.body.attempt._id}/debugging/0`;
        const save = (content) => write(agent.put(`${base}/workspace`)).set("x-attempt-token", started.body.attemptToken).send({ changedFiles: [{ path: "src/index.js", content }], createdFiles: [], deletedFiles: [] });
        await save("export const increment = (value) => value;").expect(200);

        runDebuggingProject.mockImplementationOnce(async () => {
            await new Promise((resolve) => setTimeout(resolve, 150));
            return { status: "passed", passed: 1, total: 1, tests: [{ name: "handles boundary values", passed: true }] };
        });
        const results = await Promise.all([
            write(agent.post(`${base}/run-tests`)).set("x-attempt-token", started.body.attemptToken).send({}),
            save("export const increment = (value) => value + 1;"),
            save("export const increment = (value) => value + 2;"),
        ]);
        expect(results.map((result) => result.status)).toEqual([200, 200, 200]);

        const saved = await CandidateAttempt.findById(started.body.attempt._id).lean();
        const response = saved.debuggingResponses.find((item) => item.roundIndex === 0);
        expect(response.testRuns).toHaveLength(1);
        expect(response.changedFiles[0].content).toMatch(/value \+ [12];/);
    });

    it("lets the hiring team end an in-progress attempt, freeing its slot and cutting off the candidate", async () => {
        process.env.ENABLE_DEBUGGING_ASSESSMENTS = "true";
        const created = await write(agent.post("/api/assessments"), ownerAuth).send(assessmentInput(debuggingRound(), { title: "End attempt screen" })).expect(201);
        const started = await startCandidate(created.body.shareToken, "abandoned@example.com");
        const ended = await write(agent.post(`/api/assessments/${created.body._id}/attempts/${started.body.attempt._id}/end`), ownerAuth).send({}).expect(200);
        expect(ended.body).toMatchObject({ attempt: { status: "revoked" }, released: true });

        const base = `/api/assessments/public/${created.body.shareToken}/attempts/${started.body.attempt._id}/debugging/0`;
        await write(agent.put(`${base}/workspace`)).set("x-attempt-token", started.body.attemptToken).send({ changedFiles: [], createdFiles: [], deletedFiles: [] }).expect(401);
        await write(agent.post(`/api/assessments/${created.body._id}/attempts/${started.body.attempt._id}/end`), ownerAuth).send({}).expect(409);
    });

    it("accepts candidate system-design checkpoints only with the round and question index", async () => {
        const created = await write(agent.post("/api/assessments"), ownerAuth).send(assessmentInput({
            name: "System design", description: "Design a service.", deliveryMode: "system-design", questionCount: 1,
            questions: [{ text: "Design a URL shortener.", required: true }],
        }, { title: "System design screen" })).expect(201);
        const started = await startCandidate(created.body.shareToken, "designer@example.com");
        const url = `/api/assessments/public/${created.body.shareToken}/attempts/${started.body.attempt._id}/system-design/checkpoint`;
        const transcript = "I would start with requirements, then an API service, a key-value store, and a cache in front of reads.";
        await write(agent.post(url)).set("x-attempt-token", started.body.attemptToken).send({ transcript }).expect(400);
        await write(agent.post(url)).set("x-attempt-token", started.body.attemptToken).send({ transcript, roundIndex: 0, questionIndex: 0 }).expect(200);
    });

    it("final submission returns the same candidate-safe test evidence with the diff", async () => {
        process.env.ENABLE_DEBUGGING_ASSESSMENTS = "true";
        const created = await write(agent.post("/api/assessments"), ownerAuth).send(assessmentInput(debuggingRound(), { title: "Final runner" })).expect(201);
        const started = await startCandidate(created.body.shareToken, "final-runner@example.com");
        const base = `/api/assessments/public/${created.body.shareToken}/attempts/${started.body.attempt._id}/debugging/0`;
        await write(agent.put(`${base}/workspace`)).set("x-attempt-token", started.body.attemptToken).send({ changedFiles: [{ path: "src/index.js", content: "fixed" }] }).expect(200);
        runDebuggingProject.mockResolvedValueOnce({ status: "passed", passed: 1, total: 1, tests: [{ name: "handles boundary values", passed: true }] });
        const submitted = await write(agent.post(`${base}/submit`)).set("x-attempt-token", started.body.attemptToken).send({}).expect(200);
        expect(runDebuggingProject).toHaveBeenLastCalledWith(expect.objectContaining({ runtime: "node-22" }));
        expect(submitted.body.summary).toMatchObject({ passed: 1, total: 1, diff: { changed: 1, created: 0, deleted: 0 } });
        expect(submitted.body.summary.tests).toEqual([{ name: "handles boundary values", passed: true }]);
        expect(JSON.stringify(submitted.body)).not.toMatch(/boundary\.test\.js|INTERNAL_ASSERTION/i);
        expect(submitted.body.attempt.rounds[0].questions[0].answer).toMatch(/Tests: 1\/1/);
    });

    it("lets only one of two concurrent submits run the hidden tests, rejecting the other with 409", async () => {
        process.env.ENABLE_DEBUGGING_ASSESSMENTS = "true";
        const created = await write(agent.post("/api/assessments"), ownerAuth).send(assessmentInput(debuggingRound(), { title: "Concurrent submit" })).expect(201);
        const callsAfterCreate = runDebuggingProject.mock.calls.length; // publish validation dry-runs once
        const started = await startCandidate(created.body.shareToken, "concurrent@example.com");
        const base = `/api/assessments/public/${created.body.shareToken}/attempts/${started.body.attempt._id}/debugging/0`;
        await write(agent.put(`${base}/workspace`)).set("x-attempt-token", started.body.attemptToken).send({ changedFiles: [{ path: "src/index.js", content: "fixed" }] }).expect(200);
        runDebuggingProject.mockResolvedValue({ status: "passed", passed: 1, total: 1, tests: [{ name: "handles boundary values", passed: true }] });

        const [first, second] = await Promise.all([
            write(agent.post(`${base}/submit`)).set("x-attempt-token", started.body.attemptToken).send({}),
            write(agent.post(`${base}/submit`)).set("x-attempt-token", started.body.attemptToken).send({}),
        ]);
        const statuses = [first.status, second.status].sort();
        expect(statuses).toEqual([200, 409]);
        expect(runDebuggingProject.mock.calls.length - callsAfterCreate).toBe(1);
    });

    it("never leaks another round's pre-review AI evaluation into a debugging-round submit response", async () => {
        process.env.ENABLE_DEBUGGING_ASSESSMENTS = "true";
        // Round type doesn't matter for this fix (the sanitizer applies uniformly to every
        // round); a findings-mode debugging round avoids pulling in AI question generation.
        const firstRound = debuggingRound({ responseMode: "findings", title: "Explain the race condition." });
        const created = await write(agent.post("/api/assessments"), ownerAuth)
            .send(assessmentInput(debuggingRound(), { title: "Two round leak check", rounds: [firstRound, debuggingRound()] }))
            .expect(201);
        const started = await startCandidate(created.body.shareToken, "leak-check@example.com");

        // Rounds must be completed in order — finish round 0 (findings mode, no code execution)
        // before round 1 is reachable.
        const round0 = `/api/assessments/public/${created.body.shareToken}/attempts/${started.body.attempt._id}/debugging/0`;
        await write(agent.put(`${round0}/workspace`)).set("x-attempt-token", started.body.attemptToken).send({ findings: [{
            filePath: "src/index.js", rootCause: "A read-modify-write race allows duplicate work.", evidence: "Both requests observe pending.", proposedFix: "Use an atomic conditional update.",
        }] }).expect(200);
        await write(agent.post(`${round0}/submit`)).set("x-attempt-token", started.body.attemptToken).send({}).expect(200);

        // Simulate an adaptive round that was scored by AI before any human review —
        // this must never reach the candidate in any subsequent round's response.
        await CandidateAttempt.updateOne(
            { _id: started.body.attempt._id },
            { $set: {
                "rounds.0.questions.0.adaptiveEvaluated": true,
                "rounds.0.questions.0.quickEvaluation": { competencyCoverage: { communication: 0.8 } },
                "rounds.0.questions.0.score": 7,
                "rounds.0.questions.0.suggestions": ["Be more specific about the fix."],
                "rounds.0.questions.0.feedbackComment": "Solid answer overall.",
            } },
        );

        const base = `/api/assessments/public/${created.body.shareToken}/attempts/${started.body.attempt._id}/debugging/1`;
        await write(agent.put(`${base}/workspace`)).set("x-attempt-token", started.body.attemptToken).send({ changedFiles: [{ path: "src/index.js", content: "fixed" }] }).expect(200);
        runDebuggingProject.mockResolvedValueOnce({ status: "passed", passed: 1, total: 1, tests: [{ name: "handles boundary values", passed: true }] });
        const submitted = await write(agent.post(`${base}/submit`)).set("x-attempt-token", started.body.attemptToken).send({}).expect(200);

        expect(submitted.body.attempt.rounds[0].name).toBe("Debugging");
        expect(submitted.body.attempt.rounds[0].questions[0]).not.toHaveProperty("quickEvaluation");
        expect(submitted.body.attempt.rounds[0].questions[0]).not.toHaveProperty("score");
        expect(submitted.body.attempt.rounds[0].questions[0]).not.toHaveProperty("adaptiveEvaluated");
        expect(submitted.body.attempt.rounds[0].questions[0]).not.toHaveProperty("suggestions");
        expect(submitted.body.attempt.rounds[0].questions[0]).not.toHaveProperty("feedbackComment");
        expect(submitted.body.attempt).not.toHaveProperty("overallScore");
        expect(submitted.body.attempt).not.toHaveProperty("evaluationMetadata");
        expect(JSON.stringify(submitted.body)).not.toMatch(/competencyCoverage|Be more specific|Solid answer overall/i);
    });

    it("saves file-specific findings without running code", async () => {
        process.env.ENABLE_DEBUGGING_ASSESSMENTS = "true";
        const created = await write(agent.post("/api/assessments"), ownerAuth).send(assessmentInput(debuggingRound({ responseMode: "findings", title: "Explain the race condition." }), { title: "Findings screen" })).expect(201);
        const callsAfterCreate = runDebuggingProject.mock.calls.length;
        const started = await startCandidate(created.body.shareToken, "findings@example.com");
        const base = `/api/assessments/public/${created.body.shareToken}/attempts/${started.body.attempt._id}/debugging/0`;
        await write(agent.put(`${base}/workspace`)).set("x-attempt-token", started.body.attemptToken).send({ findings: [{
            filePath: "src/index.js", rootCause: "A read-modify-write race allows duplicate work.", evidence: "Both requests observe pending.", proposedFix: "Use an atomic conditional update.",
        }] }).expect(200);
        await write(agent.post(`${base}/run-tests`)).set("x-attempt-token", started.body.attemptToken).send({}).expect(409);
        const submitted = await write(agent.post(`${base}/submit`)).set("x-attempt-token", started.body.attemptToken).send({}).expect(200);
        expect(submitted.body.summary).toEqual({ status: "submitted", findings: true, findingCount: 1 });
        expect(submitted.body.attempt.rounds[0].questions[0].answer).toMatch(/src\/index\.js/);
        expect(submitted.body.attempt.rounds[0].questions[0].answer).toMatch(/read-modify-write race/);
        expect(runDebuggingProject).toHaveBeenCalledTimes(callsAfterCreate);
    });

    it("lets a candidate reopen and revise submitted findings, but rejects reopening a code-fix round", async () => {
        process.env.ENABLE_DEBUGGING_ASSESSMENTS = "true";
        const created = await write(agent.post("/api/assessments"), ownerAuth).send(assessmentInput(debuggingRound({ responseMode: "findings", title: "Explain the race condition." }), { title: "Reopen screen" })).expect(201);
        const started = await startCandidate(created.body.shareToken, "reopen@example.com");
        const base = `/api/assessments/public/${created.body.shareToken}/attempts/${started.body.attempt._id}/debugging/0`;
        const token = { "x-attempt-token": started.body.attemptToken };

        // Reopening before any submission has happened is rejected.
        await write(agent.post(`${base}/reopen`)).set(token).send({}).expect(409);

        await write(agent.put(`${base}/workspace`)).set(token).send({ findings: [{
            filePath: "src/index.js", rootCause: "A read-modify-write race allows duplicate work.", evidence: "", proposedFix: "",
        }] }).expect(200);
        await write(agent.post(`${base}/submit`)).set(token).send({}).expect(200);

        // Once submitted, the workspace is locked...
        await write(agent.put(`${base}/workspace`)).set(token).send({ findings: [] }).expect(409);

        // ...until the candidate reopens it, revises, and resubmits with the new content.
        const reopened = await write(agent.post(`${base}/reopen`)).set(token).send({}).expect(200);
        expect(reopened.body.submittedAt).toBeFalsy();
        await write(agent.put(`${base}/workspace`)).set(token).send({ findings: [{
            filePath: "src/index.js", rootCause: "Revised: the update isn't atomic across replicas.", evidence: "", proposedFix: "",
        }] }).expect(200);
        const resubmitted = await write(agent.post(`${base}/submit`)).set(token).send({}).expect(200);
        expect(resubmitted.body.attempt.rounds[0].questions[0].answer).toMatch(/isn't atomic across replicas/);

        // Reopening again after the resubmit still works (not a one-time allowance).
        await write(agent.post(`${base}/reopen`)).set(token).send({}).expect(200);

        // A code-fix round can never be reopened, submitted or not.
        const codeFixCreated = await write(agent.post("/api/assessments"), ownerAuth).send(assessmentInput(debuggingRound({ responseMode: "code_fix" }), { title: "Reopen code-fix screen" })).expect(201);
        const codeFixStarted = await startCandidate(codeFixCreated.body.shareToken, "reopen-codefix@example.com");
        const codeFixBase = `/api/assessments/public/${codeFixCreated.body.shareToken}/attempts/${codeFixStarted.body.attempt._id}/debugging/0`;
        const codeFixToken = { "x-attempt-token": codeFixStarted.body.attemptToken };
        await write(agent.put(`${codeFixBase}/workspace`)).set(codeFixToken).send({ changedFiles: [{ path: "src/index.js", content: "fixed" }] }).expect(200);
        runDebuggingProject.mockResolvedValueOnce({ status: "passed", passed: 1, total: 1, tests: [{ name: "handles boundary values", passed: true }] });
        await write(agent.post(`${codeFixBase}/submit`)).set(codeFixToken).send({}).expect(200);
        await write(agent.post(`${codeFixBase}/reopen`)).set(codeFixToken).send({}).expect(409);
    });
});
