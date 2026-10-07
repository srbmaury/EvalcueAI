import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import app from "../../app.js";
import connectDB from "../../config/db.js";
import Interview from "../../models/Interview.js";
import Round from "../../models/Round.js";
import User from "../../models/User.js";
import { signAccessToken } from "../../utils/tokens.js";

let replset;
let agent;

const authFor = (user) => ({ Authorization: `Bearer ${signAccessToken(user._id, user.tokenVersion)}` });
const origin = "http://localhost:5000";

const post = (path, auth) => agent.post(path)
    .set(auth)
    .set("origin", origin)
    .set("referer", `${origin}/`);

describe("adaptive conversational interview API", () => {
    beforeAll(async () => {
        replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
        process.env.MONGO_URI = replset.getUri();
        process.env.NODE_ENV = "test";
        process.env.MONGO_TLS = "false";
        process.env.MONGO_REQUIRE_TRANSACTIONS = "false";
        process.env.TEST_FORCE_GENERATOR_EMPTY = "true";
        delete process.env.OPENAI_API_KEY;
        delete process.env.GEMINI_API_KEY;
        await connectDB();
        agent = request.agent(app);
    }, 60000);

    afterAll(async () => {
        try { await mongoose.connection.close(); } catch {}
        if (replset) await replset.stop();
    }, 30000);

    it("generates one question at a time and auto-completes at the maximum evidence budget", async () => {
        const user = await User.create({
            name: "Adaptive User",
            email: "adaptive-engine@example.com",
            provider: "google",
            googleId: "adaptive-engine-google-id",
            isVerified: true,
        });
        const round = await Round.create({
            name: "Backend Deep Dive",
            description: "Evaluate APIs, reliability, failure handling, and production trade-offs.",
            deliveryMode: "conversational",
            questionLimit: 2,
            skills: ["APIs", "Reliability", "Technical Trade-offs"],
        });
        const interview = await Interview.create({
            user: user._id,
            company: "Acme",
            jobRole: "Backend Engineer",
            jobDescription: "Build reliable APIs and distributed backend services.",
            rounds: [{ round: round._id }],
        });
        const auth = authFor(user);

        const prepared = await post(`/api/questions/${interview._id}/rounds/${round._id}/prepare`, auth)
            .send({ count: 2 })
            .expect(200);
        expect(prepared.body.questions).toHaveLength(1);
        expect(prepared.body.adaptiveState).toMatchObject({ enabled: true, maxQuestions: 2, questionsAsked: 0 });
        const firstQuestion = prepared.body.questions[0].question.text;
        expect(firstQuestion.length).toBeGreaterThan(20);

        // An empty answer (a client auto-advancing on silence before anything was said) must not consume
        // the question or trigger a follow-up.
        const empty = await post(`/api/questions/${round._id}/answer`, auth).send({ index: 0, answer: "   " }).expect(400);
        expect(empty.body.message).toBe("Answer is empty");

        const firstAnswer = await post(`/api/questions/${round._id}/answer`, auth)
            .send({ index: 0, answer: "I would make the API idempotent, define failure semantics, and monitor retries and saturation before scaling horizontally." })
            .expect(200);
        expect(firstAnswer.body).toMatchObject({ success: true, done: false, nextIndex: 1, followUp: null });
        expect(firstAnswer.body.adaptive).toMatchObject({ enabled: true, maxQuestions: 2, questionsAsked: 1 });

        const afterFirst = await agent.get(`/api/interviews/${interview._id}`).set(auth).expect(200);
        const activeRound = afterFirst.body.rounds[0].round;
        expect(activeRound.questions).toHaveLength(2);
        expect(activeRound.questions[1].question.text).not.toBe(firstQuestion);
        expect(activeRound.status).toBe("in_progress");

        const secondAnswer = await post(`/api/questions/${round._id}/answer`, auth)
            .send({ index: 1, answer: "For reliability I would start with timeouts, bounded retries, idempotency, and observable failure budgets, then validate behavior under partial dependency failures." })
            .expect(200);
        expect(secondAnswer.body).toMatchObject({ success: true, done: true, nextIndex: 2, followUp: null });
        expect(secondAnswer.body.adaptive).toMatchObject({ questionsAsked: 2, maxQuestions: 2 });

        const completed = await agent.get(`/api/interviews/${interview._id}`).set(auth).expect(200);
        expect(completed.body.rounds[0].round).toMatchObject({ status: "completed" });
        expect(completed.body.rounds[0].round.adaptiveState).toMatchObject({
            enabled: true,
            questionsAsked: 2,
            maxQuestions: 2,
        });
        expect(completed.body.rounds[0].round.adaptiveState.completedReason).toMatch(/Maximum adaptive question budget reached/);
    }, 60000);
});
