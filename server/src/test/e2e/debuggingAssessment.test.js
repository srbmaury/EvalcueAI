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
    { path: "tests/increment.test.js", content: "VISIBLE_ASSERTION", kind: "visible_test" },
    { path: "hidden/boundary.test.js", content: "SECRET_EXPECTED_VALUE", kind: "hidden_test" },
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

const failingStarter = { status: "failed", visiblePassed: 0, visibleTotal: 1, hiddenPassed: 0, hiddenTotal: 1, visibleFailures: [{ name: "tests/increment.test.js", message: "failed" }] };

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

    it("publishes safe debugging metadata and keeps project files behind the attempt boundary", async () => {
        process.env.ENABLE_DEBUGGING_ASSESSMENTS = "true";
        const capabilities = await agent.get("/api/assessments/capabilities").set(ownerAuth).expect(200);
        expect(capabilities.body.debuggingAssessments).toBe(true);
        expect(capabilities.body.debuggingRuntimes.map((item) => item.runtime)).toContain("node-22");

        const created = await write(agent.post("/api/assessments"), ownerAuth).send(assessmentInput(debuggingRound())).expect(201);
        const publicResponse = await agent.get(`/api/assessments/public/${created.body.shareToken}`).expect(200);
        expect(publicResponse.body.rounds[0].debugging).toMatchObject({ responseMode: "code_fix", runtime: "node-22", sourceFileCount: 1, visibleTestCount: 1, hiddenTestCount: 1 });
        expect(JSON.stringify(publicResponse.body)).not.toContain("VISIBLE_ASSERTION");
        expect(JSON.stringify(publicResponse.body)).not.toContain("SECRET_EXPECTED_VALUE");

        const started = await startCandidate(created.body.shareToken);
        const workspace = await agent.get(`/api/assessments/public/${created.body.shareToken}/attempts/${started.body.attempt._id}/debugging/0`).set("x-attempt-token", started.body.attemptToken).expect(200);
        expect(workspace.body.files.map((file) => file.path)).toEqual(["src/index.js", "tests/increment.test.js"]);
        expect(JSON.stringify(workspace.body)).not.toContain("hidden/boundary.test.js");
        expect(JSON.stringify(workspace.body)).not.toContain("SECRET_EXPECTED_VALUE");
    });

    it("autosaves a candidate overlay, runs only visible tests, and keeps hidden diagnostics private", async () => {
        process.env.ENABLE_DEBUGGING_ASSESSMENTS = "true";
        const created = await write(agent.post("/api/assessments"), ownerAuth).send(assessmentInput(debuggingRound(), { title: "Runner screen" })).expect(201);
        const started = await startCandidate(created.body.shareToken, "runner@example.com");
        const base = `/api/assessments/public/${created.body.shareToken}/attempts/${started.body.attempt._id}/debugging/0`;

        await write(agent.put(`${base}/workspace`)).set("x-attempt-token", started.body.attemptToken).send({
            changedFiles: [{ path: "src/index.js", content: "export const increment = (value) => value + 1;" }], createdFiles: [], deletedFiles: [],
        }).expect(200);

        runDebuggingProject.mockResolvedValueOnce({ status: "passed", visiblePassed: 1, visibleTotal: 1, hiddenPassed: 0, hiddenTotal: 0, visibleFailures: [] });
        const run = await write(agent.post(`${base}/run-tests`)).set("x-attempt-token", started.body.attemptToken).send({}).expect(200);
        expect(run.body).toEqual({ status: "passed", visiblePassed: 1, visibleTotal: 1, hiddenPassed: 0, hiddenTotal: 0, visibleFailures: [] });
        expect(runDebuggingProject).toHaveBeenLastCalledWith(expect.objectContaining({ includeHiddenTests: false, files: expect.arrayContaining([expect.objectContaining({ path: "hidden/boundary.test.js", content: "SECRET_EXPECTED_VALUE" })]) }));
        expect(JSON.stringify(run.body)).not.toMatch(/SECRET|hidden\/boundary/i);
    });

    it("final submission executes hidden tests and returns only aggregate hidden evidence", async () => {
        process.env.ENABLE_DEBUGGING_ASSESSMENTS = "true";
        const created = await write(agent.post("/api/assessments"), ownerAuth).send(assessmentInput(debuggingRound(), { title: "Final runner" })).expect(201);
        const started = await startCandidate(created.body.shareToken, "final-runner@example.com");
        const base = `/api/assessments/public/${created.body.shareToken}/attempts/${started.body.attempt._id}/debugging/0`;
        await write(agent.put(`${base}/workspace`)).set("x-attempt-token", started.body.attemptToken).send({ changedFiles: [{ path: "src/index.js", content: "fixed" }] }).expect(200);
        runDebuggingProject.mockResolvedValueOnce({ status: "passed", visiblePassed: 1, visibleTotal: 1, hiddenPassed: 1, hiddenTotal: 1, visibleFailures: [] });
        const submitted = await write(agent.post(`${base}/submit`)).set("x-attempt-token", started.body.attemptToken).send({}).expect(200);
        expect(runDebuggingProject).toHaveBeenLastCalledWith(expect.objectContaining({ includeHiddenTests: true }));
        expect(submitted.body.summary).toMatchObject({ hiddenPassed: 1, hiddenTotal: 1, diff: { changed: 1, created: 0, deleted: 0 } });
        expect(JSON.stringify(submitted.body)).not.toMatch(/SECRET|hidden\/boundary/i);
        expect(submitted.body.attempt.rounds[0].questions[0].answer).toMatch(/Debugging solution submitted/);
    });

    it("saves and submits findings without invoking Judge0", async () => {
        process.env.ENABLE_DEBUGGING_ASSESSMENTS = "true";
        const created = await write(agent.post("/api/assessments"), ownerAuth).send(assessmentInput(debuggingRound({ responseMode: "findings", title: "Explain the race condition." }), { title: "Findings screen" })).expect(201);
        const callsAfterCreate = runDebuggingProject.mock.calls.length;
        const started = await startCandidate(created.body.shareToken, "findings@example.com");
        const base = `/api/assessments/public/${created.body.shareToken}/attempts/${started.body.attempt._id}/debugging/0`;
        await write(agent.put(`${base}/workspace`)).set("x-attempt-token", started.body.attemptToken).send({ findings: {
            rootCause: "A read-modify-write race allows duplicate charges.", evidence: "Both requests observe pending.", proposedFix: "Use an atomic conditional update.", impact: "Duplicate charges.", testingStrategy: "Run concurrent duplicate requests.",
        } }).expect(200);
        await write(agent.post(`${base}/run-tests`)).set("x-attempt-token", started.body.attemptToken).send({}).expect(409);
        const submitted = await write(agent.post(`${base}/submit`)).set("x-attempt-token", started.body.attemptToken).send({}).expect(200);
        expect(submitted.body.summary).toEqual({ status: "submitted", findings: true });
        expect(submitted.body.attempt.rounds[0].questions[0].answer).toMatch(/Root cause/);
        expect(runDebuggingProject).toHaveBeenCalledTimes(callsAfterCreate);
    });
});
