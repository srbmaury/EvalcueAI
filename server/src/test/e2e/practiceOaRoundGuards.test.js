import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import app from "../../app.js";
import connectDB from "../../config/db.js";
import Interview from "../../models/Interview.js";
import Round from "../../models/Round.js";
import Question from "../../models/Question.js";
import User from "../../models/User.js";
import { signAccessToken } from "../../utils/tokens.js";

let replset;
let agent;

const authFor = (user) => ({ Authorization: `Bearer ${signAccessToken(user._id, user.tokenVersion)}` });
const origin = "http://localhost:5000";
const post = (path, auth) => agent.post(path).set(auth).set("origin", origin).set("referer", `${origin}/`);

describe("practice OA round guards", () => {
    beforeAll(async () => {
        replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
        process.env.MONGO_URI = replset.getUri();
        process.env.NODE_ENV = "test";
        process.env.MONGO_TLS = "false";
        process.env.MONGO_REQUIRE_TRANSACTIONS = "false";
        await connectDB();
        agent = request.agent(app);
    }, 60000);

    afterAll(async () => {
        try { await mongoose.connection.close(); } catch {}
        if (replset) await replset.stop();
    }, 30000);

    const setupOaRound = async (email) => {
        const user = await User.create({ name: "OA Guard User", email, provider: "google", googleId: `${email}-google-id`, isVerified: true });
        const question = await Question.create({ text: "Reverse a linked list in place.", tags: [] });
        const round = await Round.create({
            name: "Coding", description: "Data structures", deliveryMode: "online-assessment",
            questionLimit: 1, status: "pending",
            questions: [{ question: question._id, sourceType: "planned" }],
        });
        const interview = await Interview.create({
            user: user._id, company: "Acme", jobRole: "Backend Engineer",
            jobDescription: "Build reliable APIs.", rounds: [{ round: round._id }],
        });
        return { user, auth: authFor(user), round, interview, questionId: question._id };
    };

    it("does not regenerate/discard an already-prepared OA round's questions on a retried prepare call", async () => {
        const { auth, round, interview, questionId } = await setupOaRound("oa-prepare-guard@example.com");

        const prepared = await post(`/api/questions/${interview._id}/rounds/${round._id}/prepare`, auth).send({ count: 1 }).expect(200);
        expect(prepared.body.questions).toHaveLength(1);
        expect(String(prepared.body.questions[0].question._id)).toBe(String(questionId));
        expect(prepared.body.status).toBe("in_progress");

        // A retried/duplicate prepare call (no idempotency key on this route) must reuse
        // the same questions, not regenerate and discard them.
        const preparedAgain = await post(`/api/questions/${interview._id}/rounds/${round._id}/prepare`, auth).send({ count: 1 }).expect(200);
        expect(preparedAgain.body.questions).toHaveLength(1);
        expect(String(preparedAgain.body.questions[0].question._id)).toBe(String(questionId));
    });

    it("does not let a late/retried answers submit overwrite a completed OA round's stored answers", async () => {
        const { auth, round } = await setupOaRound("oa-submit-guard@example.com");

        await post(`/api/questions/${round._id}/answers`, auth).send({ answers: ["original answer"] }).expect(200);
        await post(`/api/questions/${round._id}/complete`, auth).expect(200);

        const late = await post(`/api/questions/${round._id}/answers`, auth).send({ answers: ["a different, later answer"] }).expect(200);
        expect(late.body).toEqual({ success: true, replayed: true });

        const persisted = await Round.findById(round._id).populate("questions.question");
        expect(persisted.status).toBe("completed");
        expect(persisted.questions[0].answerGiven).toBe("original answer");
    });
});
