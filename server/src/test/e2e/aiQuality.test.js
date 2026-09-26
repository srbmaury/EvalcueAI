import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import app from "../../app.js";
import connectDB from "../../config/db.js";
import User from "../../models/User.js";
import AiQualityCounter from "../../models/AiQualityCounter.js";
import { recordAiQualityEvent } from "../../services/aiQuality.js";
import { recordGuardEvent } from "../../utils/generateQuestions/questionGuards.js";
import { signAccessToken } from "../../utils/tokens.js";

let replset;
const auth = (user) => ({ Authorization: `Bearer ${signAccessToken(user._id, user.tokenVersion)}` });

describe("admin AI quality report", () => {
    beforeAll(async () => {
        replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
        process.env.MONGO_URI = replset.getUri();
        process.env.NODE_ENV = "test";
        process.env.MONGO_TLS = "false";
        process.env.MONGO_REQUIRE_TRANSACTIONS = "false";
        await connectDB();
        await AiQualityCounter.init();
    }, 60000);

    afterEach(() => AiQualityCounter.deleteMany({}));

    afterAll(async () => {
        try { await mongoose.connection.close(); } catch {}
        if (replset) await replset.stop();
    }, 30000);

    it("does not lose concurrent first increments of a new key", async () => {
        for (let i = 0; i < 20; i += 1) recordAiQualityEvent("feedback_evaluation", "result", "ok");
        await expect.poll(async () => (await AiQualityCounter.aggregate([{ $group: { _id: null, n: { $sum: "$count" } } }]))[0]?.n || 0).toBe(20);
        expect(await AiQualityCounter.countDocuments()).toBe(1);
    });

    it("persists guard events with their denominators and reports rates to admins only", async () => {
        for (let i = 0; i < 9; i += 1) recordAiQualityEvent("followup", "decision", "asked");
        recordAiQualityEvent("followup", "decision", "skipped");
        recordGuardEvent("followup", "repeat", "suppressed");
        recordAiQualityEvent("adaptive_evaluation", "result", "scored");
        recordAiQualityEvent("adaptive_evaluation", "result", "unscored");
        await expect.poll(async () => (await AiQualityCounter.aggregate([{ $group: { _id: null, n: { $sum: "$count" } } }]))[0]?.n || 0).toBe(13);

        const admin = await User.create({ name: "Admin", email: "ai-admin@example.com", password: "Passw0rd!", isVerified: true, role: "admin" });
        const member = await User.create({ name: "Member", email: "ai-member@example.com", password: "Passw0rd!", isVerified: true });
        await request(app).get("/api/admin/ai-quality").set(auth(member)).expect(403);
        const { body } = await request(app).get("/api/admin/ai-quality").set(auth(admin)).expect(200);
        expect(body.volume).toMatchObject({ followUpDecisions: 10, adaptiveEvaluations: 2 });
        expect(body.rates).toMatchObject({ followUpGuardInterventions: 10, followUpSuppressed: 10, adaptiveUnscored: 50, feedbackFailed: null });
        expect(body.daily).toHaveLength(1);
        expect(body.totals).toContainEqual({ stage: "followup", signal: "repeat", outcome: "suppressed", count: 1 });
    }, 60000);
});
