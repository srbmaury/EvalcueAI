import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import app from "../../app.js";
import connectDB from "../../config/db.js";
import User from "../../models/User.js";
import OrganizationMembership from "../../models/OrganizationMembership.js";
import Organization from "../../models/Organization.js";
import { signAccessToken } from "../../utils/tokens.js";

let replset;
let agent;

const origin = "http://localhost:5000";
const writeHeaders = (request, auth) => request
    .set(auth)
    .set("origin", origin)
    .set("referer", `${origin}/`);

const assessmentInput = {
    title: "Backend engineering assessment",
    jobRole: "Backend Engineer",
    jobDescription: "Build reliable distributed backend services and explain production tradeoffs clearly.",
    status: "draft",
    rounds: [{
        name: "Technical judgment",
        description: "Production engineering decisions",
        deliveryMode: "conversational",
        questionCount: 1,
        questions: [{ text: "How would you make a critical API resilient to downstream failures?" }],
    }],
};

const authFor = (user, organizationId) => ({
    Authorization: `Bearer ${signAccessToken(user._id, user.tokenVersion)}`,
    ...(organizationId ? { "X-Organization-Id": String(organizationId) } : {}),
});

describe("Hiring organization access", () => {
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

    it("scopes assessments by organization and enforces membership roles", async () => {
        const owner = await User.create({ name: "Org Owner", email: "org-owner@example.com", password: "Passw0rd!", isVerified: true });
        const reviewer = await User.create({ name: "Org Reviewer", email: "org-reviewer@example.com", password: "Passw0rd!", isVerified: true });
        const outsider = await User.create({ name: "Outsider", email: "outsider@example.com", password: "Passw0rd!", isVerified: true });

        const ownerAuth = authFor(owner);
        const organizationResponse = await writeHeaders(agent.post("/api/organizations"), ownerAuth)
            .send({ name: "Acme Engineering" })
            .expect(201);
        const organizationId = organizationResponse.body.organization._id;
        ownerAuth["X-Organization-Id"] = organizationId;

        await agent.get("/api/assessments").set(authFor(owner)).expect(400);

        const memberResponse = await writeHeaders(
            agent.post(`/api/organizations/${organizationId}/members`),
            ownerAuth,
        )
            .send({ email: reviewer.email, role: "reviewer" })
            .expect(201);
        const reviewerMembershipId = memberResponse.body.member._id;

        const created = await writeHeaders(agent.post("/api/assessments"), ownerAuth)
            .send(assessmentInput)
            .expect(201);
        const assessmentId = created.body._id;
        expect(created.body.organization).toBe(organizationId);
        expect(created.body.createdBy).toBe(String(owner._id));

        const inviteOnlyAssessment = await writeHeaders(agent.post("/api/assessments"), ownerAuth)
            .send({ ...assessmentInput, title: "Invite-only backend screen", status: "active", inviteOnly: true })
            .expect(201);
        const inviteResult = await writeHeaders(
            agent.post(`/api/assessments/${inviteOnlyAssessment.body._id}/invitations`),
            ownerAuth,
        ).send({ candidates: [{ email: "candidate-invite@example.com", name: "Invited Candidate" }] }).expect(200);
        const invitation = inviteResult.body.invitations[0];
        await agent.get(`/api/assessments/public/${inviteOnlyAssessment.body.shareToken}`).expect(403);
        await agent.get(`/api/assessments/public/${inviteOnlyAssessment.body.shareToken}?invite=${invitation._id}`).expect(200);
        await writeHeaders(agent.post(`/api/assessments/public/${inviteOnlyAssessment.body.shareToken}/start`), {})
            .send({ name: "Invited Candidate", email: "candidate-invite@example.com", privacyConsent: true })
            .expect(403);
        await writeHeaders(agent.post(`/api/assessments/public/${inviteOnlyAssessment.body.shareToken}/start`), {})
            .send({ name: "Wrong Candidate", email: "wrong@example.com", privacyConsent: true, invitationId: invitation._id })
            .expect(403);
        await writeHeaders(agent.post(`/api/assessments/public/${inviteOnlyAssessment.body.shareToken}/start`), {})
            .send({ name: "Invited Candidate", email: "candidate-invite@example.com", privacyConsent: true, invitationId: invitation._id })
            .expect(201);

        const reviewerAuth = authFor(reviewer, organizationId);
        await agent.get(`/api/organizations/${organizationId}/members`).set(reviewerAuth).expect(403);
        const ownerMembers = await agent.get(`/api/organizations/${organizationId}/members`).set(ownerAuth).expect(200);
        expect(ownerMembers.body.members).toHaveLength(2);
        await agent.get("/api/assessments").set(reviewerAuth).expect(403);
        const reviewerOverview = await agent.get("/api/assessments/overview").set(reviewerAuth).expect(200);
        expect(reviewerOverview.body.summary).toEqual({});
        expect(reviewerOverview.body.assessments).toHaveLength(2);
        expect(reviewerOverview.body.assessments.every((assessment) => Object.keys(assessment).every((key) => ["_id", "title"].includes(key)))).toBe(true);
        await agent.get(`/api/assessments/${assessmentId}/preview`).set(reviewerAuth).expect(403);

        await writeHeaders(agent.post("/api/assessments"), reviewerAuth)
            .send(assessmentInput)
            .expect(403);
        await writeHeaders(agent.patch(`/api/assessments/${assessmentId}`), reviewerAuth)
            .send({ status: "closed" })
            .expect(403);

        // Reviewer role is allowed through the review permission middleware; the fake attempt itself is absent.
        await writeHeaders(
            agent.patch(`/api/assessments/${assessmentId}/attempts/${new mongoose.Types.ObjectId()}/review`),
            reviewerAuth,
        )
            .send({ reviewerScore: 8, reviewerDecision: "advance", reviewerNotes: "Strong evidence across the technical discussion." })
            .expect(404);

        await agent.get("/api/assessments").set(authFor(outsider, organizationId)).expect(403);

        const outsiderOrganization = await writeHeaders(agent.post("/api/organizations"), authFor(outsider))
            .send({ name: "Outside Company" })
            .expect(201);
        const outsiderAuth = authFor(outsider, outsiderOrganization.body.organization._id);
        const outsiderList = await agent.get("/api/assessments").set(outsiderAuth).expect(200);
        expect(outsiderList.body.items).toHaveLength(0);

        const transfer = await writeHeaders(
            agent.post(`/api/organizations/${organizationId}/transfer-ownership`),
            ownerAuth,
        )
            .send({ membershipId: reviewerMembershipId })
            .expect(200);
        expect(transfer.body.message).toBe("Ownership transferred");
        expect(String(transfer.body.ownerMembershipId)).toBe(String(reviewerMembershipId));

        const [formerOwnerMembership, newOwnerMembership] = await Promise.all([
            OrganizationMembership.findOne({ organization: organizationId, user: owner._id }).lean(),
            OrganizationMembership.findOne({ organization: organizationId, user: reviewer._id }).lean(),
        ]);
        expect(formerOwnerMembership.role).toBe("admin");
        expect(newOwnerMembership.role).toBe("owner");
        const organizationAfterTransfer = await Organization.findById(organizationId).lean();
        expect(String(organizationAfterTransfer.createdBy)).toBe(String(owner._id));

        // A multi-member organization cannot be orphaned by deleting its current owner account.
        await writeHeaders(agent.delete("/api/auth/profile"), reviewerAuth)
            .send({ confirmation: "DELETE", password: "Passw0rd!" })
            .expect(409);
    }, 30000);
});
