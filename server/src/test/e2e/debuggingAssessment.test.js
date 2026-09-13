import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";

const { runDebuggingProject } = vi.hoisted(() => ({ runDebuggingProject: vi.fn() }));
vi.mock("../../services/debuggingProjectRunner.js", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, runDebuggingProject };
});

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
        expect(runDebuggingProject).toHaveBeenLastCalledWith(expect.objectContaining({ includeHiddenTests: true, files: expect.arrayContaining([expect.objectContaining({ path: "tests/boundary.test.js", content: "INTERNAL_ASSERTION" })]) }));
        expect(JSON.stringify(run.body)).not.toMatch(/boundary\.test\.js|INTERNAL_ASSERTION/i);
    });

    it("final submission returns the same candidate-safe test evidence with the diff", async () => {
        process.env.ENABLE_DEBUGGING_ASSESSMENTS = "true";
        const created = await write(agent.post("/api/assessments"), ownerAuth).send(assessmentInput(debuggingRound(), { title: "Final runner" })).expect(201);
        const started = await startCandidate(created.body.shareToken, "final-runner@example.com");
        const base = `/api/assessments/public/${created.body.shareToken}/attempts/${started.body.attempt._id}/debugging/0`;
        await write(agent.put(`${base}/workspace`)).set("x-attempt-token", started.body.attemptToken).send({ changedFiles: [{ path: "src/index.js", content: "fixed" }] }).expect(200);
        runDebuggingProject.mockResolvedValueOnce({ status: "passed", passed: 1, total: 1, tests: [{ name: "handles boundary values", passed: true }] });
        const submitted = await write(agent.post(`${base}/submit`)).set("x-attempt-token", started.body.attemptToken).send({}).expect(200);
        expect(runDebuggingProject).toHaveBeenLastCalledWith(expect.objectContaining({ includeHiddenTests: true }));
        expect(submitted.body.summary).toMatchObject({ passed: 1, total: 1, diff: { changed: 1, created: 0, deleted: 0 } });
        expect(submitted.body.summary.tests).toEqual([{ name: "handles boundary values", passed: true }]);
        expect(JSON.stringify(submitted.body)).not.toMatch(/boundary\.test\.js|INTERNAL_ASSERTION/i);
        expect(submitted.body.attempt.rounds[0].questions[0].answer).toMatch(/Tests: 1\/1/);
    });

    it("saves file-specific findings without invoking Judge0", async () => {
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
});
