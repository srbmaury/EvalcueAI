import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import app from "../../app.js";
import User from "../../models/User.js";
import Resume from "../../models/Resume.js";
import ResumeReview from "../../models/ResumeReview.js";
import SavedExperience from "../../models/SavedExperience.js";
import ProductFeedback from "../../models/ProductFeedback.js";
import BillingEvent from "../../models/BillingEvent.js";
import PracticeUsageCounter from "../../models/PracticeUsageCounter.js";
import ReminderDelivery from "../../models/ReminderDelivery.js";
import ProductEvent from "../../models/ProductEvent.js";
import RefreshToken from "../../models/RefreshToken.js";
import Assessment from "../../models/Assessment.js";
import CandidateAttempt from "../../models/CandidateAttempt.js";
import CandidateUsageReservation from "../../models/CandidateUsageReservation.js";
import AdaptiveInterviewTrace from "../../models/AdaptiveInterviewTrace.js";
import Interview from "../../models/Interview.js";
import OrganizationUsageCounter from "../../models/OrganizationUsageCounter.js";
import OrganizationMembership from "../../models/OrganizationMembership.js";
import { currentMonth, PRACTICE_PLAN_LIMITS } from "../../services/practiceEntitlements.js";
import { HIRING_PLAN_LIMITS } from "../../services/hiringEntitlements.js";
import { finalizeCandidateInterview } from "../../services/organizationUsage.js";
import { deliverDuePracticeReminders } from "../../services/practiceReminders.js";
import Stripe from "stripe";
import Question from "../../models/Question.js";
import connectDB from "../../config/db.js";
import { signAccessToken } from "../../utils/tokens.js";
import metrics from "../../metrics/index.js";

let replset;
let agent;
let accessToken;
const previousCodeExec = process.env.ENABLE_CODE_EXEC;
const previousStt = process.env.ENABLE_STT;

describe("Launch-critical full product journey E2E", () => {
    beforeAll(async () => {
        replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
        const uri = replset.getUri();
        process.env.MONGO_URI = uri;
        process.env.NODE_ENV = "test";
        process.env.MONGO_TLS = "false";
        process.env.MONGO_REQUIRE_TRANSACTIONS = "false";
        process.env.TEST_FORCE_GENERATOR_EMPTY = "true";
        process.env.ACCOUNT_DATA_EXPORT_ENABLED = "true";
        process.env.ENABLE_CODE_EXEC = "true";
        process.env.ENABLE_STT = "true";
        await connectDB();
        agent = request.agent(app);
    }, 60000);

    afterAll(async () => {
        try { await mongoose.connection.close(); } catch {}
        if (replset) await replset.stop();
        if (previousCodeExec === undefined) delete process.env.ENABLE_CODE_EXEC;
        else process.env.ENABLE_CODE_EXEC = previousCodeExec;
        if (previousStt === undefined) delete process.env.ENABLE_STT;
        else process.env.ENABLE_STT = previousStt;
    }, 30000);

    it("allows independent sessions for an account", async () => {
        const origin = "http://localhost:5000";
        await User.create({ name: "Multi Session", email: "multi-session@example.com", password: "Passw0rd!", isVerified: true });
        const firstClient = request.agent(app);
        const secondClient = request.agent(app);
        const firstLogin = await firstClient.post("/api/auth/login").set("origin", origin).set("referer", `${origin}/`).send({ email: "multi-session@example.com", password: "Passw0rd!" }).expect(200);
        const secondLogin = await secondClient.post("/api/auth/login").set("origin", origin).set("referer", `${origin}/`).send({ email: "multi-session@example.com", password: "Passw0rd!" }).expect(200);

        await firstClient.get("/api/auth/profile").set("Authorization", `Bearer ${firstLogin.body.token}`).expect(200);
        await secondClient.get("/api/auth/profile").set("Authorization", `Bearer ${secondLogin.body.token}`).expect(200);
        await firstClient.post("/api/auth/refresh").expect(200);
        await secondClient.post("/api/auth/refresh").expect(200);
        const user = await User.findOne({ email: "multi-session@example.com" });
        expect(await RefreshToken.countDocuments({ user: user._id, rotatedAt: null })).toBe(2);

        await firstClient.post("/api/auth/logout").set("Authorization", `Bearer ${firstLogin.body.token}`).set("origin", origin).set("referer", `${origin}/`).expect(200);
        await firstClient.post("/api/auth/refresh").expect(401);
        await secondClient.post("/api/auth/refresh").expect(200);
        await secondClient.get("/api/auth/profile").set("Authorization", `Bearer ${secondLogin.body.token}`).expect(200);
        expect(await RefreshToken.countDocuments({ user: user._id, rotatedAt: null })).toBe(1);
    });

    it("registers, logs in, uploads resume, creates interview, prepares first round", async () => {
        const origin = "http://localhost:5000";

        // Register
        const reg = await agent
            .post("/api/auth/register")
            .send({ name: "Test User", email: "t@example.com", password: "Passw0rd!", termsAccepted: true })
            .set("origin", origin)
            .set("referer", `${origin}/`)
            .expect(201);
        expect(reg.body?.message).toMatch(/verify/i);

        // Mark user verified for test login
        const u = await User.findOne({ email: "t@example.com" });
        u.isVerified = true;
        await u.save();

        // Login
        const login = await agent
            .post("/api/auth/login")
            .send({ email: "t@example.com", password: "Passw0rd!" })
            .set("origin", origin)
            .set("referer", `${origin}/`)
            .expect(200);
        accessToken = login.body?.token;
        expect(accessToken).toBeDefined();

        const auth = { Authorization: `Bearer ${accessToken}` };
        const hiringOrganization = await agent.post("/api/organizations")
            .set(auth).set("origin", origin).set("referer", `${origin}/`)
            .send({ name: "Acme Hiring" }).expect(201);
        auth["X-Organization-Id"] = hiringOrganization.body.organization._id;
        await User.updateOne({ _id: login.body.user?._id || u._id }, { $set: { practicePlan: "pro", practiceSubscriptionStatus: "active" } });
        const hiringTrialEntitlements = await agent.get("/api/billing/hiring/entitlements").set(auth).expect(200);
        expect(hiringTrialEntitlements.body).toMatchObject({ plan: "trial", limits: { candidateInterviews: HIRING_PLAN_LIMITS.trial.candidateInterviews } });
        const personalPracticeEntitlements = await agent.get("/api/billing/practice/entitlements").set(auth).expect(200);
        expect(personalPracticeEntitlements.body.plan).toBe("pro");
        await User.updateOne({ _id: login.body.user?._id || u._id }, { $set: { practicePlan: "free", practiceSubscriptionStatus: "inactive" } });

        // Create minimal resume directly via model (avoids Cloudinary)
        const me = await User.findOne({ email: "t@example.com" });
        const secondOrganization = await agent.post("/api/organizations").set(auth).set("origin", origin).set("referer", `${origin}/`).send({ name: "Second Hiring Org" }).expect(201);
        const secondOrgAuth = { ...auth, "X-Organization-Id": secondOrganization.body.organization._id };
        const secondOrgEntitlements = await agent.get("/api/billing/hiring/entitlements").set(secondOrgAuth).expect(200);
        expect(secondOrgEntitlements.body).toMatchObject({ plan: "none", limits: { candidateInterviews: 0 } });
        const resumeDoc = await Resume.create({
            user: me._id,
            fileUrl: "http://localhost/resumes/test.pdf",
            publicId: "resumes/test",
            fileName: "test.pdf",
            fileType: "application/pdf",
            fileSize: 1234,
            extractedText: "Sample resume text for testing. Skills: JavaScript, Node.js",
            tags: ["test"],
            notes: "",
        });
        const resumeId = resumeDoc._id.toHexString();
        const updatedResume = await agent.put(`/api/resumes/${resumeId}`).set(auth).set("origin", origin).set("referer", `${origin}/`).send({ fileName: "backend-resume.pdf", tags: ["backend", "node"], notes: "Primary launch-test resume" }).expect(200);
        expect(updatedResume.body).toMatchObject({ fileName: "backend-resume.pdf", tags: ["backend", "node"], notes: "Primary launch-test resume" });

        await Resume.insertMany(Array.from({ length: 6 }, (_, index) => ({
            user: me._id, fileUrl: `http://localhost/resumes/${index}.pdf`, publicId: `resumes/test-${index}`,
            fileName: `resume-${index}.pdf`, fileType: "application/pdf", fileSize: 100 + index,
            extractedText: "Pagination test resume", tags: [], notes: "",
        })));
        await ResumeReview.insertMany(Array.from({ length: 7 }, (_, index) => ({
            user: me._id, resume: resumeDoc._id, resumeName: resumeDoc.fileName, role: `Role ${index}`,
            summary: `Review ${index}`, atsScore: 70 + index,
        })));
        await SavedExperience.insertMany(Array.from({ length: 7 }, (_, index) => ({
            user: me._id, title: `Experience ${index}`, url: `https://example.com/${index}`,
            snippet: `Snippet ${index}`, company: "Acme", role: "Engineer",
        })));

        const resumePage = await agent.get("/api/resumes?page=2&limit=3").set(auth).expect(200);
        expect(resumePage.body.items).toHaveLength(3);
        expect(resumePage.body.total).toBe(7);
        expect(resumePage.body.totalPages).toBe(3);
        const reviewPage = await agent.get("/api/resumes/reviews?page=2&limit=5").set(auth).expect(200);
        expect(reviewPage.body.items).toHaveLength(2);
        expect(reviewPage.body.totalPages).toBe(2);
        const experiencePage = await agent.get("/api/experiences/saved?page=2&limit=5").set(auth).expect(200);
        expect(experiencePage.body.items).toHaveLength(2);
        expect(experiencePage.body.totalPages).toBe(2);
        const savedExperience = await agent.post("/api/experiences/saved").set(auth).set("origin", origin).set("referer", `${origin}/`).send({ title: "Acme backend interview", url: "https://example.com/acme-backend", snippet: "APIs and system design", company: "Acme", role: "Backend Engineer" }).expect(201);
        await agent.delete(`/api/experiences/saved/${savedExperience.body._id}`).set(auth).set("origin", origin).set("referer", `${origin}/`).expect(200);

        // Create interview with 2 rounds
        const create = await agent
            .post("/api/interviews")
            .set(auth)
            .set("origin", origin)
            .set("referer", `${origin}/`)
            .send({
                resumeId,
                company: "Acme",
                jobRole: "Software Engineer",
                jobDescription: "Build things",
                rounds: [
                    { roundName: "Round 1", description: "Conversational", deliveryMode: "conversational", questionLimit: 2 },
                    { roundName: "Round 2", description: "Online assessment", deliveryMode: "online-assessment", questionLimit: 2 },
                ],
            });
        if (create.status !== 201) {
            console.error("CreateInterview failed:", create.status, create.body);
        }
        expect(create.status).toBe(201);
        expect(create.body?._id).toBeDefined();
        const interviewId = create.body._id;

        // Fetch interview
        const fetched = await agent.get(`/api/interviews/${interviewId}`).set(auth).expect(200);
        expect(Array.isArray(fetched.body?.rounds)).toBe(true);
        const firstRoundId = fetched.body.rounds[0].round._id;

        // A different authenticated user cannot read or mutate this user's resources.
        const otherUser = await User.create({
            name: "Other User",
            email: "other@example.com",
            provider: "google",
            googleId: "test-other-google-id",
            isVerified: true,
        });
        const otherAuth = { Authorization: `Bearer ${signAccessToken(otherUser._id, otherUser.tokenVersion)}` };
        const otherOrganization = await agent.post("/api/organizations")
            .set(otherAuth).set("origin", origin).set("referer", `${origin}/`)
            .send({ name: "Other Hiring Team" }).expect(201);
        otherAuth["X-Organization-Id"] = otherOrganization.body.organization._id;
        await agent.get(`/api/interviews/${interviewId}`).set(otherAuth).expect(404);
        await agent
            .post("/api/interviews")
            .set(otherAuth)
            .set("origin", origin)
            .set("referer", `${origin}/`)
            .send({
                resumeId,
                company: "Acme",
                jobRole: "Software Engineer",
                jobDescription: "Build things",
                rounds: [{ roundName: "Round 1", description: "Conversational", deliveryMode: "conversational", questionLimit: 2 }],
            })
            .expect(404);
        await agent
            .post("/api/jobs/prepare-questions")
            .set(otherAuth)
            .set("origin", origin)
            .set("referer", `${origin}/`)
            .send({ interviewId, roundId: firstRoundId, count: 2 })
            .expect(404);
        await agent.get("/api/jobs/failed/prepare-questions").set(otherAuth).expect(403);
        await agent.get("/api/jobs/status/not-a-queue/job-id").set(otherAuth).expect(400);

        // Product feedback is visible and mutable only to administrators.
        const submittedFeedback = await agent.post("/api/product-feedback").set(auth).set("origin", origin).set("referer", `${origin}/`).send({ category: "idea", message: "Add more practice presets", page: "/dashboard" }).expect(201);
        const productFeedback = await ProductFeedback.findById(submittedFeedback.body._id);
        await agent.get("/api/admin/feedback").set(auth).expect(403);
        await User.updateOne({ _id: otherUser._id }, { $set: { role: "admin" } });
        const adminFeedback = await agent.get("/api/admin/feedback?status=new&page=1&limit=10").set(otherAuth).expect(200);
        expect(adminFeedback.body.items.some((item) => item._id === String(productFeedback._id))).toBe(true);
        const reviewedFeedback = await agent.patch(`/api/admin/feedback/${productFeedback._id}`).set(otherAuth).set("origin", origin).set("referer", `${origin}/`).send({ status: "reviewed" }).expect(200);
        expect(reviewedFeedback.body.status).toBe("reviewed");

        // Stripe webhooks reject bad signatures and process each signed event only once.
        const webhookSecret = "whsec_meaningful_test_secret";
        const previousWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
        const webhookPayload = JSON.stringify({ id: "evt_idempotency_test", object: "event", type: "customer.updated", data: { object: { id: "cus_test" } } });
        await agent.post("/api/billing/webhook").set("content-type", "application/json").set("stripe-signature", "bad-signature").send(webhookPayload).expect(400);
        const stripe = new Stripe("sk_test_dummy");
        const signature = stripe.webhooks.generateTestHeaderString({ payload: webhookPayload, secret: webhookSecret });
        await agent.post("/api/billing/webhook").set("content-type", "application/json").set("stripe-signature", signature).send(webhookPayload).expect(200);
        const replay = await agent.post("/api/billing/webhook").set("content-type", "application/json").set("stripe-signature", signature).send(webhookPayload).expect(200);
        expect(replay.body.duplicate).toBe(true);
        expect(await BillingEvent.countDocuments({ eventId: "evt_idempotency_test" })).toBe(1);
        process.env.STRIPE_WEBHOOK_SECRET = previousWebhookSecret;

        // Account responses use an allowlist and never expose credential material.
        await User.updateOne({ _id: me._id }, { $set: { resetPasswordToken: "sensitive-hash", resetPasswordExpires: new Date(Date.now() + 60000) } });
        const profile = await agent.get("/api/auth/profile").set(auth).expect(200);
        expect(profile.body.email).toBe("t@example.com");
        expect(profile.body.password).toBeUndefined();
        expect(profile.body.resetPasswordToken).toBeUndefined();
        expect(profile.body.verificationToken).toBeUndefined();
        expect(profile.body.tokenVersion).toBeUndefined();
        expect(profile.body.practicePlan).toBe("free");
        const updatedPlan = await agent.put("/api/auth/profile").set(auth).set("origin", origin).set("referer", `${origin}/`).send({ practiceGoal: "switch-role", targetRole: "Backend Engineer", weeklyPracticeTarget: 4, reminderEnabled: true, reminderDay: "monday", reminderTime: "19:00", reminderTimezone: "Asia/Kolkata" }).expect(200);
        expect(updatedPlan.body.user.targetRole).toBe("Backend Engineer");
        if (updatedPlan.body.token) auth.Authorization = `Bearer ${updatedPlan.body.token}`;
        await agent.post("/api/events").set(auth).set("origin", origin).set("referer", `${origin}/`).send({ event: "dashboard_viewed", path: "/dashboard" }).expect(202);
        expect(await ProductEvent.countDocuments({ user: me._id, event: "dashboard_viewed" })).toBe(1);
        await agent.post("/api/events").set(auth).set("origin", origin).set("referer", `${origin}/`).send({ event: "seo_resource_practice_started", path: "/practice/resources/system-design-interview-questions" }).expect(202);
        await agent.post("/api/events").set(auth).set("origin", origin).set("referer", `${origin}/`).send({ event: "seo_resource_assessment_created", path: "/hire/resources/technical-assessment-template" }).expect(202);
        expect(await ProductEvent.countDocuments({ user: me._id, event: { $in: ["seo_resource_practice_started", "seo_resource_assessment_created"] } })).toBe(2);
        await agent.post("/api/events").set(auth).set("origin", origin).set("referer", `${origin}/`).send({ event: "not_allowed" }).expect(400);
        await agent.post("/api/auth/reminders/test").set(auth).set("origin", origin).set("referer", `${origin}/`).expect(403);
        await agent.post("/api/auth/reminders/test").set(otherAuth).set("origin", origin).set("referer", `${origin}/`).expect(200);
        const previousReminderDelivery = process.env.REMINDER_DELIVERY_ENABLED;
        process.env.REMINDER_DELIVERY_ENABLED = "true";
        const dueAt = new Date("2026-08-03T13:35:00.000Z"); // Monday 19:05 Asia/Kolkata
        const firstDelivery = await deliverDuePracticeReminders(dueAt);
        const duplicateDelivery = await deliverDuePracticeReminders(dueAt);
        expect(firstDelivery).toMatchObject({ checked: 1, enqueued: 1, sent: 1, failed: 0 });
        expect(duplicateDelivery.enqueued).toBe(0);
        expect(await ReminderDelivery.countDocuments({ user: me._id, status: "sent" })).toBe(1);
        const deliveryHistory = await agent.get("/api/auth/reminders/deliveries").set(auth).expect(200);
        expect(deliveryHistory.body.items[0]).toMatchObject({ status: "sent", attempts: 1 });
        const exportResponse = await agent.get("/api/auth/export").set(auth).expect(200);
        expect(exportResponse.headers["content-disposition"]).toContain("evalcue-export");
        expect(exportResponse.body).toMatchObject({ profile: { email: "t@example.com" } });
        expect(exportResponse.body.productEvents).toHaveLength(3);
        process.env.ACCOUNT_DATA_EXPORT_ENABLED = "false";
        await agent.get("/api/auth/export").set(auth).expect(503);
        process.env.ACCOUNT_DATA_EXPORT_ENABLED = "true";
        process.env.REMINDER_DELIVERY_ENABLED = previousReminderDelivery;
        const recommendations = await agent.get("/api/recommendations").set(auth).expect(200);
        expect(recommendations.body.goal).toBe("switch-role");
        expect(recommendations.body.actions).toHaveLength(3);
        const entitlements = await agent.get("/api/billing/practice/entitlements").set(auth).expect(200);
        expect(entitlements.body.plan).toBe("free");
        expect(entitlements.body.used.interviews).toBe(1);
        expect(entitlements.body.limits.interviews).toBeGreaterThan(0);

        // Assessment links expose only candidate-safe fields; attempts require their opaque secret,
        // duplicate emails cannot overwrite answers, and reports remain owner-only.
        const assessmentCreate = await agent.post("/api/assessments").set(auth).set("origin", origin).set("referer", `${origin}/`).send({
            title: "Backend candidate screen", jobRole: "Backend Engineer",
            jobDescription: "Build secure and reliable APIs using Node.js and MongoDB.",
            status: "active", followUpsEnabled: false, durationMinutes: 25, contactEmail: "hiring@example.com",
            integrity: { enabled: true, requireFullscreen: true, trackFocus: true, trackClipboard: true, requireCamera: true, monitorFacePresence: true, retentionDays: 14 },
            rounds: [{ name: "Technical", description: "Backend judgment", questionCount: 1, questions: [{ text: "How would you secure a production API?", weight: 2, competencies: ["Security"], knockout: true }] }],
        }).expect(201);
        const assessmentId = assessmentCreate.body._id;
        const shareToken = assessmentCreate.body.shareToken;
        expect(await Assessment.exists({ _id: assessmentId, organization: hiringOrganization.body.organization._id, createdBy: me._id })).toBeTruthy();
        expect(assessmentCreate.body.rounds[0].questions[0]).toMatchObject({ text: "How would you secure a production API?", weight: 2, competencies: ["Security"], knockout: true });
        const invitationResponse = await agent.post(`/api/assessments/${assessmentId}/invitations`).set(auth).set("origin", origin).set("referer", `${origin}/`).send({ candidates: [{ email: "candidate@example.com", name: "Candidate One" }] }).expect(200);
        expect(invitationResponse.body.invitations[0]).toMatchObject({ email: "candidate@example.com", status: "sent" });
        await agent.get(`/api/assessments/public/${shareToken}?invite=${invitationResponse.body.invitations[0]._id}`).expect(200);
        expect((await Assessment.findById(assessmentId).lean()).invitations[0].status).toBe("opened");

        // Reviewed manual questions are preserved exactly; AI generation endpoints are authenticated.
        const hybridAssessment = await agent.post("/api/assessments").set(auth).set("origin", origin).set("referer", `${origin}/`).send({
            title: "Hybrid backend screen", status: "draft", jobRole: "Backend Engineer", opensAt: null, expiresAt: null,
            jobDescription: "Design secure and observable Node.js services in production.",
            rounds: [{ name: "Architecture", description: "System design", deliveryMode: "online-assessment", questionCount: 2, aiPrompt: "Include observability", questions: [
                { text: "Describe a service you made more observable and the outcome." },
                { text: "How would you protect an idempotent payment webhook?" },
            ] }],
        }).expect(201);
        expect(hybridAssessment.body.rounds[0].questions.map((question) => question.text)).toEqual([
            "Describe a service you made more observable and the outcome.",
            "How would you protect an idempotent payment webhook?",
        ]);
        expect(hybridAssessment.body.rounds[0].deliveryMode).toBe("online-assessment");
        await agent.get(`/api/assessments/public/${hybridAssessment.body.shareToken}`).expect(404);
        const draftPreview = await agent.get(`/api/assessments/${hybridAssessment.body._id}/preview`).set(auth).expect(200);
        expect(draftPreview.body.rounds[0].questions).toHaveLength(2);
        await agent.patch(`/api/assessments/${hybridAssessment.body._id}`).set(auth).set("origin", origin).set("referer", `${origin}/`).send({
            title: "Hybrid backend screen edited", jobRole: "Backend Engineer", jobDescription: "Design secure and observable Node.js services in production.",
            rounds: [{ name: "Architecture", description: "System design", deliveryMode: "online-assessment", questionCount: 2, questions: hybridAssessment.body.rounds[0].questions.map(({ text }) => ({ text })) }],
        }).expect(200).expect(({ body }) => expect(body.title).toBe("Hybrid backend screen edited"));
        await agent.patch(`/api/assessments/${hybridAssessment.body._id}`).set(auth).set("origin", origin).set("referer", `${origin}/`).send({ status: "active" }).expect(200);
        await agent.get(`/api/assessments/public/${hybridAssessment.body.shareToken}`).expect(200);
        await agent.post("/api/assessments/questions/generate").send({ jobRole: "Engineer", jobDescription: "A sufficiently detailed job description here.", roundName: "Technical", prompt: "Generate API questions", count: 2 }).expect(401);
        await agent.post("/api/assessments/questions/generate").set(auth).set("origin", origin).set("referer", `${origin}/`).send({ jobRole: "Engineer", jobDescription: "A sufficiently detailed job description here.", roundName: "Technical", prompt: "Generate two API questions", count: 2 }).expect(503);
        const improvedQuestion = await agent.post("/api/assessments/questions/improve").set(auth).set("origin", origin).set("referer", `${origin}/`).send({ question: "Tell me about APIs?", jobRole: "Backend Engineer", jobDescription: "A sufficiently detailed job description here.", roundName: "Technical" }).expect(200);
        expect(improvedQuestion.body.text).toBe("Tell me about APIs?");

        const publicAssessment = await agent.get(`/api/assessments/public/${shareToken}`).expect(200);
        expect(publicAssessment.body).toMatchObject({ title: "Backend candidate screen", durationMinutes: 25, contactEmail: "hiring@example.com", followUpsEnabled: false, rounds: [{ deliveryMode: "conversational", questionCount: 1 }] });
        expect(publicAssessment.body.jobDescription).toBeUndefined();
        expect(publicAssessment.body.shareToken).toBeUndefined();
        expect(publicAssessment.body.rounds[0].questions).toBeUndefined();

        await agent.post(`/api/assessments/public/${shareToken}/start`).set("origin", origin).set("referer", `${origin}/`).send({ name: "No Consent", email: "no-consent@example.com" }).expect(400);
        await agent.post(`/api/assessments/public/${shareToken}/start`).set("origin", origin).set("referer", `${origin}/`).send({ name: "No Integrity Consent", email: "no-integrity@example.com", privacyConsent: true }).expect(400);
        const startedAttempt = await agent.post(`/api/assessments/public/${shareToken}/start`).set("origin", origin).set("referer", `${origin}/`).send({ name: "Candidate One", email: "candidate@example.com", privacyConsent: true, integrityConsent: true }).expect(201);
        const attemptId = startedAttempt.body.attempt._id;
        const attemptToken = startedAttempt.body.attemptToken;
        expect(attemptToken).toBeTruthy();
        expect(startedAttempt.body.attempt.candidateEmail).toBeUndefined();
        expect(startedAttempt.body.attempt.overallScore).toBeUndefined();
        expect(startedAttempt.body.attempt.rounds[0].deliveryMode).toBe("conversational");
        const orgUsage = await OrganizationUsageCounter.findOne({ organization: hiringOrganization.body.organization._id, metric: "candidateInterviews", period: "lifetime" }).lean();
        expect(orgUsage).toMatchObject({ used: 0, reserved: 1 });
        const sharedMembership = await OrganizationMembership.create({ organization: hiringOrganization.body.organization._id, user: otherUser._id, role: "reviewer", status: "active" });
        const otherAcmeAuth = { ...otherAuth, "X-Organization-Id": hiringOrganization.body.organization._id };
        const sharedHiringEntitlements = await agent.get("/api/billing/hiring/entitlements").set(otherAcmeAuth).expect(200);
        expect(sharedHiringEntitlements.body).toMatchObject({ plan: "trial", used: { candidateInterviews: 0 } });
        await OrganizationMembership.updateOne({ _id: sharedMembership._id }, { $set: { status: "disabled" } });
        await agent.post(`/api/assessments/public/${shareToken}/attempts/${attemptId}/integrity-events`).set("origin", origin).set("referer", `${origin}/`).set("x-attempt-token", attemptToken).send({ type: "tab_hidden", metadata: { question: 1 } }).expect(201);
        await agent.post(`/api/assessments/public/${shareToken}/attempts/${attemptId}/integrity-events`).set("origin", origin).set("referer", `${origin}/`).set("x-attempt-token", attemptToken).send({ type: "face_missing", metadata: { durationSeconds: 10 } }).expect(201);
        await agent.post(`/api/assessments/public/${shareToken}/attempts/${attemptId}/integrity-events`).set("origin", origin).set("referer", `${origin}/`).set("x-attempt-token", attemptToken).send({ type: "face_restored", metadata: { durationSeconds: 12 } }).expect(201);
        await agent.post(`/api/assessments/public/${shareToken}/attempts/${attemptId}/run-code`).set("origin", origin).set("referer", `${origin}/`).set("x-attempt-token", "wrong-token").send({ language: "javascript", code: "console.log('no')" }).expect(401);
        await agent.post(`/api/assessments/public/${shareToken}/attempts/${attemptId}/transcribe`).set("origin", origin).set("referer", `${origin}/`).set("x-attempt-token", "wrong-token").expect(401);
        await agent.post(`/api/assessments/public/${shareToken}/attempts/${attemptId}/run-code`).set("origin", origin).set("referer", `${origin}/`).set("x-attempt-token", attemptToken).send({}).expect(400);
        await agent.post(`/api/assessments/public/${shareToken}/attempts/${attemptId}/transcribe`).set("origin", origin).set("referer", `${origin}/`).set("x-attempt-token", attemptToken).expect(400);
        await agent.post(`/api/assessments/public/${shareToken}/start`).set("origin", origin).set("referer", `${origin}/`).send({ name: "Overwrite", email: "candidate@example.com", privacyConsent: true, integrityConsent: true }).expect(409);
        await agent.post(`/api/assessments/public/${shareToken}/attempts/${attemptId}/submit`).set("origin", origin).set("referer", `${origin}/`).set("x-attempt-token", "wrong-token").expect(401);
        await agent.post(`/api/assessments/public/${shareToken}/attempts/${attemptId}/submit`).set("origin", origin).set("referer", `${origin}/`).set("x-attempt-token", attemptToken).expect(400);
        await agent.put(`/api/assessments/public/${shareToken}/attempts/${attemptId}/answer`).set("origin", origin).set("referer", `${origin}/`).set("x-attempt-token", "wrong-token").send({ roundIndex: 0, questionIndex: 0, answer: "Unauthorized overwrite" }).expect(401);
        const savedAnswer = await agent.put(`/api/assessments/public/${shareToken}/attempts/${attemptId}/answer`).set("origin", origin).set("referer", `${origin}/`).set("x-attempt-token", attemptToken).send({ roundIndex: 0, questionIndex: 0, answer: "Use indexes, hashed credentials, and expiring sessions.", spokenExplanation: "I would verify this with load and security tests." }).expect(200);
        expect(savedAnswer.body.attempt.rounds[0].questions[0].answer).toContain("hashed credentials");
        expect(savedAnswer.body.attempt.rounds[0].questions[0].spokenExplanation).toBe("I would verify this with load and security tests.");
        expect(savedAnswer.body.attempt.rounds[0].questions[0].feedbackComment).toBeUndefined();
        const reservedAttempt = await CandidateAttempt.findById(attemptId).select("+usageReservationId").lean();
        expect(await finalizeCandidateInterview({ reservationId: reservedAttempt.usageReservationId })).toBe(true);
        const finalizedUsage = await OrganizationUsageCounter.findOne({ organization: hiringOrganization.body.organization._id, metric: "candidateInterviews", period: "lifetime" }).lean();
        expect(finalizedUsage).toMatchObject({ used: 1, reserved: 0 });
        await CandidateAttempt.updateOne({ _id: attemptId }, { $set: { status: "submitted", submittedAt: new Date(), overallScore: 8, "rounds.0.score": 8, "rounds.0.questions.0.score": 8, "rounds.0.questions.0.feedbackComment": "Strong answer" } });
        const ownerReport = await agent.get(`/api/assessments/${assessmentId}`).set(auth).expect(200);
        expect(ownerReport.body.attempts[0]).toMatchObject({ candidateEmail: "candidate@example.com", overallScore: 8 });
        expect(ownerReport.body.attempts[0].rounds[0].questions[0].feedbackComment).toBe("Strong answer");
        expect(ownerReport.body.attempts[0].integrityEvents[0].type).toBe("tab_hidden");
        expect(ownerReport.body.attempts[0].integrityEvents.map((event) => event.type)).toEqual(["tab_hidden", "face_missing", "face_restored"]);
        const humanReview = await agent.patch(`/api/assessments/${assessmentId}/attempts/${attemptId}/review`).set(auth).set("origin", origin).set("referer", `${origin}/`).send({ reviewerScore: 7.5, reviewerDecision: "advance", reviewerNotes: "Strong security evidence." }).expect(200);
        expect(humanReview.body.attempt).toMatchObject({ reviewerScore: 7.5, reviewerDecision: "advance", reviewerNotes: "Strong security evidence." });
        await agent.patch(`/api/assessments/${assessmentId}/attempts/${attemptId}/review`).set(otherAuth).set("origin", origin).set("referer", `${origin}/`).send({ reviewerScore: 1, reviewerDecision: "reject", reviewerNotes: "Unauthorized" }).expect(404);
        await agent.get(`/api/assessments/${assessmentId}`).expect(401);
        await agent.get(`/api/assessments/${assessmentId}`).set(otherAuth).expect(404);
        await agent.post(`/api/assessments/public/${shareToken}/attempts/${attemptId}/submit`).set("origin", origin).set("referer", `${origin}/`).set("x-attempt-token", attemptToken).expect(200).expect(({ body }) => expect(body.status).toBe("submitted"));
        const assessmentList = await agent.get("/api/assessments?page=1&limit=10").set(auth).expect(200);
        expect(assessmentList.body.items.find((item) => item._id === assessmentId)).toMatchObject({ attemptCount: 1, submittedCount: 1 });
        const hiringOverview = await agent.get("/api/assessments/overview?status=submitted&search=Candidate&page=1&limit=10").set(auth).expect(200);
        expect(hiringOverview.body.summary).toMatchObject({ assessments: 2, activeAssessments: 2, totalCandidates: 1, submitted: 1, inProgress: 0, averageScore: 8 });
        expect(hiringOverview.body.candidates[0]).toMatchObject({ candidateName: "Candidate One", candidateEmail: "candidate@example.com", status: "submitted", assessment: { title: "Backend candidate screen" } });
        const emptyAssessmentFilter = await agent.get(`/api/assessments/overview?assessmentId=${hybridAssessment.body._id}`).set(auth).expect(200);
        expect(emptyAssessmentFilter.body).toMatchObject({ candidates: [], total: 0 });
        const otherHiringOverview = await agent.get("/api/assessments/overview").set(otherAuth).expect(200);
        expect(otherHiringOverview.body).toMatchObject({ summary: { assessments: 0, totalCandidates: 0 }, candidates: [] });
        const exportWithAssessments = await agent.get("/api/auth/export").set(auth).expect(200);
        expect(exportWithAssessments.body.assessments).toBeUndefined();
        expect(exportWithAssessments.body.candidateAttempts).toBeUndefined();
        await agent.patch(`/api/assessments/${assessmentId}`).set(auth).set("origin", origin).set("referer", `${origin}/`).send({ status: "closed" }).expect(200);
        const closedPublicAssessment = await agent.get(`/api/assessments/public/${shareToken}`).expect(200);
        expect(closedPublicAssessment.body.acceptingNewCandidates).toBe(false);
        await agent.post(`/api/assessments/public/${shareToken}/start`).set("origin", origin).set("referer", `${origin}/`).send({ name: "Late Candidate", email: "late@example.com", privacyConsent: true, integrityConsent: true }).expect(404);
        await agent.post(`/api/assessments/public/${shareToken}/attempts/${attemptId}/run-code`).set("origin", origin).set("referer", `${origin}/`).set("x-attempt-token", attemptToken).send({}).expect(401);
        await agent.post(`/api/assessments/public/${shareToken}/attempts/${attemptId}/transcribe`).set("origin", origin).set("referer", `${origin}/`).set("x-attempt-token", attemptToken).expect(401);
        const lifecycleMetric = await metrics.assessmentsTotal.get();
        const funnelMetric = await metrics.candidateAssessmentActionsTotal.get();
        expect(lifecycleMetric.values.length).toBeGreaterThan(0);
        expect(funnelMetric.values.find((value) => value.labels.action === "start" && value.labels.outcome === "success" && value.labels.followups === "disabled")?.value).toBeGreaterThanOrEqual(1);
        expect(funnelMetric.values.find((value) => value.labels.action === "answer" && value.labels.outcome === "unauthorized")?.value).toBeGreaterThanOrEqual(1);

        await PracticeUsageCounter.updateOne({ user: me._id, metric: "interviews", period: currentMonth() }, { $set: { used: PRACTICE_PLAN_LIMITS.free.interviewsPerMonth } }, { upsert: true });
        const limited = await agent.post("/api/interviews").set(auth).set("origin", origin).set("referer", `${origin}/`).send({ resumeId, company: "Limit Test", jobRole: "Engineer", jobDescription: "Validate plan enforcement", rounds: [{ roundName: "Screen", description: "A valid screening round" }] }).expect(429);
        expect(limited.body).toMatchObject({ code: "PRACTICE_LIMIT_REACHED", metric: "interviews", limit: PRACTICE_PLAN_LIMITS.free.interviewsPerMonth });
        expect(await PracticeUsageCounter.findOne({ user: me._id, metric: "interviews", period: currentMonth() }).lean()).toMatchObject({ used: PRACTICE_PLAN_LIMITS.free.interviewsPerMonth });
        await agent
            .post(`/api/questions/${interviewId}/rounds/${firstRoundId}/prepare`)
            .set(otherAuth)
            .set("origin", origin)
            .set("referer", `${origin}/`)
            .send({ count: 2 })
            .expect(404);

        // Seed generic questions for fallback
        await Question.create([
            { text: "Explain event loop in Node.js", tags: ["node", "event loop"] },
            { text: "What is closure in JavaScript?", tags: ["javascript"] },
            { text: "Describe REST vs GraphQL", tags: ["api"] },
        ]);

        // Prepare first round
        const prep = await agent
            .post(`/api/questions/${interviewId}/rounds/${firstRoundId}/prepare`)
            .set(auth)
            .set("origin", origin)
            .set("referer", `${origin}/`)
            .send({ count: 2 });
        if (prep.status !== 200) {
            console.error("Prepare failed:", prep.status, prep.body);
        }
        expect(prep.status).toBe(200);

        const refetched = await agent.get(`/api/interviews/${interviewId}`).set(auth).expect(200);
        const round = refetched.body.rounds[0].round;
        expect((round.questions || []).length).toBeGreaterThan(0);

        // The shared-quota check above temporarily added another organization member.
        // Remove that test membership before exercising sole-owner account deletion.
        await OrganizationMembership.deleteOne({ organization: hiringOrganization.body.organization._id, user: otherUser._id });

        const roundIds = (await Interview.findById(interviewId).lean()).rounds.map((entry) => entry.round);
        const organizationId = hiringOrganization.body.organization._id;
        // Both exist before deletion, so the assertions below prove they are removed rather than never created.
        expect(await AdaptiveInterviewTrace.exists({ round: { $in: roundIds } })).not.toBeNull();
        expect(await CandidateUsageReservation.exists({ organization: organizationId })).not.toBeNull();

        // Self-service deletion requires confirmation and removes account-owned data.
        await agent
            .delete("/api/auth/profile")
            .set(auth)
            .set("origin", origin)
            .set("referer", `${origin}/`)
            .send({ confirmation: "DELETE", password: "wrong" })
            .expect(400);
        await agent
            .delete("/api/auth/profile")
            .set(auth)
            .set("origin", origin)
            .set("referer", `${origin}/`)
            .send({ confirmation: "DELETE", password: "Passw0rd!" })
            .expect(200);
        expect(await User.exists({ _id: me._id })).toBeNull();
        expect(await Resume.exists({ user: me._id })).toBeNull();
        expect(await Assessment.exists({ organization: hiringOrganization.body.organization._id })).toBeNull();
        expect(await CandidateAttempt.exists({ assessment: assessmentId })).toBeNull();
        expect(await AdaptiveInterviewTrace.exists({ round: { $in: roundIds } })).toBeNull();
        expect(await CandidateUsageReservation.exists({ organization: organizationId })).toBeNull();
    }, 120000);
});