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
const origin = "http://localhost:5000";
const authFor = (user) => ({ Authorization: `Bearer ${signAccessToken(user._id, user.tokenVersion)}` });
const del = (path, auth) => request(app).delete(path).set(auth).set("origin", origin).set("referer", `${origin}/`);

const makeInterview = async (email, roundNames) => {
    const user = await User.create({ name: "Skip User", email, provider: "google", googleId: `${email}-gid`, isVerified: true });
    const rounds = [];
    for (const name of roundNames) rounds.push(await Round.create({ name, description: `Live system design: ${name}`, deliveryMode: "conversational", questionLimit: 1, status: "pending", questions: [] }));
    const interview = await Interview.create({ user: user._id, company: "Acme", jobRole: "Backend Engineer", jobDescription: "Build reliable services.", rounds: rounds.map((round) => ({ round: round._id })) });
    return { auth: authFor(user), interview, rounds };
};

describe("practice skip round", () => {
    beforeAll(async () => {
        replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
        process.env.MONGO_URI = replset.getUri();
        process.env.NODE_ENV = "test";
        process.env.MONGO_TLS = "false";
        process.env.MONGO_REQUIRE_TRANSACTIONS = "false";
        await connectDB();
    }, 60000);

    afterAll(async () => {
        try { await mongoose.connection.close(); } catch {}
        if (replset) await replset.stop();
    }, 30000);

    it("skips a system-design round while another round remains", async () => {
        const { auth, interview, rounds } = await makeInterview("skip-design@example.com", ["Notification design", "Caching design"]);
        await del(`/api/questions/${interview._id}/rounds/${rounds[0]._id}`, auth).expect(200);
        const after = await Interview.findById(interview._id).lean();
        expect(after.rounds.map((entry) => String(entry.round))).toEqual([String(rounds[1]._id)]);
    });

    it("refuses to skip the only round, which would leave an empty interview", async () => {
        const { auth, interview, rounds } = await makeInterview("skip-only@example.com", ["Notification design"]);
        const response = await del(`/api/questions/${interview._id}/rounds/${rounds[0]._id}`, auth).expect(400);
        expect(response.body.message).toMatch(/only round/);
        expect(await Round.countDocuments({ _id: rounds[0]._id })).toBe(1);
    });
});
