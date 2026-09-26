import crypto from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import app from "../../app.js";
import connectDB from "../../config/db.js";
import User from "../../models/User.js";
import Assessment from "../../models/Assessment.js";
import CandidateAttempt from "../../models/CandidateAttempt.js";
import CandidateSelfIdentification from "../../models/CandidateSelfIdentification.js";
import { signAccessToken } from "../../utils/tokens.js";

let replset;
let agent;
const origin = "http://localhost:5000";
const write = (req, auth) => req.set(auth).set("origin", origin).set("referer", `${origin}/`);
const authFor = (user, organizationId) => ({
    Authorization: `Bearer ${signAccessToken(user._id, user.tokenVersion)}`,
    ...(organizationId ? { "X-Organization-Id": String(organizationId) } : {}),
});
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");

describe("fairness report and candidate self-identification", () => {
    beforeAll(async () => {
        replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
        process.env.MONGO_URI = replset.getUri();
        process.env.NODE_ENV = "test";
        process.env.MONGO_TLS = "false";
        process.env.MONGO_REQUIRE_TRANSACTIONS = "false";
        process.env.TEST_FORCE_GENERATOR_EMPTY = "true";
        await connectDB();
        agent = request.agent(app);
    }, 60000);

    afterAll(async () => {
        try { await mongoose.connection.close(); } catch {}
        if (replset) await replset.stop();
    }, 30000);

    it("stores self-identification only after submission and reports aggregates to owners only", async () => {
        const owner = await User.create({ name: "Fair Owner", email: "fair-owner@example.com", password: "Passw0rd!", isVerified: true });
        const reviewer = await User.create({ name: "Fair Reviewer", email: "fair-reviewer@example.com", password: "Passw0rd!", isVerified: true });
        const org = await write(agent.post("/api/organizations"), authFor(owner)).send({ name: "Fair Co" }).expect(201);
        const organizationId = org.body.organization._id;
        const ownerAuth = authFor(owner, organizationId);
        await write(agent.post(`/api/organizations/${organizationId}/members`), ownerAuth).send({ email: reviewer.email, role: "reviewer" }).expect(201);

        const assessment = await Assessment.create({
            organization: organizationId, createdBy: owner._id, title: "Backend screen", jobRole: "Backend Engineer",
            jobDescription: "Build reliable backend services and explain trade-offs clearly.", status: "active",
            shareToken: crypto.randomBytes(24).toString("hex"),
            rounds: [{ name: "Technical", description: "", deliveryMode: "conversational", questions: [{ text: "Explain idempotency." }] }],
        });
        const makeAttempt = (index, status, token) => CandidateAttempt.create({
            assessment: assessment._id, candidateName: `Candidate ${index}`, candidateEmail: `c${index}@example.com`,
            accessTokenHash: hash(token), privacyConsentAt: new Date(), status,
            overallScore: status === "submitted" ? (index % 2 ? 8 : 4) : undefined,
            reviewerDecision: status === "submitted" ? (index % 2 ? "advance" : "reject") : "",
        });

        const started = await makeAttempt(99, "started", "token-99");
        const selfIdPath = (attempt) => `/api/assessments/public/${assessment.shareToken}/attempts/${attempt._id}/self-identification`;
        await write(agent.put(selfIdPath(started)), { "X-Attempt-Token": "token-99" }).send({ sex: "female" }).expect(401);

        for (let index = 0; index < 10; index += 1) {
            const token = `token-${index}`;
            const attempt = await makeAttempt(index, "submitted", token);
            await write(agent.put(selfIdPath(attempt)), { "X-Attempt-Token": "wrong" }).send({ sex: "male" }).expect(401);
            await write(agent.put(selfIdPath(attempt)), { "X-Attempt-Token": token })
                .send({ sex: index % 2 ? "female" : "male", raceEthnicity: "asian" }).expect(200);
        }
        await write(agent.put(selfIdPath(started)), { "X-Attempt-Token": "token-99" }).send({ sex: "unknown" }).expect(400);
        expect(await CandidateSelfIdentification.countDocuments({ organization: organizationId })).toBe(10);

        await agent.get("/api/assessments/fairness").set(authFor(reviewer, organizationId)).expect(403);
        const report = await agent.get(`/api/assessments/fairness?assessmentId=${assessment._id}`).set(ownerAuth).expect(200);
        expect(report.body.attempts).toBe(10);
        expect(report.body.selfIdentified).toBe(10);
        const male = report.body.selection.sex.groups.find((group) => group.key === "male");
        expect(male).toMatchObject({ eligible: 5, favourable: 0, impactRatio: 0, flagged: true });
        expect(JSON.stringify(report.body)).not.toMatch(/example\.com|Candidate \d/);

        const assessmentReport = await agent.get(`/api/assessments/${assessment._id}`).set(ownerAuth).expect(200);
        expect(JSON.stringify(assessmentReport.body)).not.toMatch(/raceEthnicity|asian/);
    }, 60000);
});
