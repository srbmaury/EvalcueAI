import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import app from "../../app.js";
import User from "../../models/User.js";
import RefreshToken from "../../models/RefreshToken.js";
import connectDB from "../../config/db.js";
import { hashOpaqueToken } from "../../utils/tokens.js";

const origin = "http://localhost:5000";
let replset;

const refreshCookieFrom = (response) => {
    const cookie = (response.headers["set-cookie"] || []).find((value) => value.startsWith("refreshToken="));
    return cookie ? decodeURIComponent(cookie.split(";")[0].slice("refreshToken=".length)) : "";
};
const refreshWith = (raw) => request(app).post("/api/auth/refresh").set("Cookie", `refreshToken=${encodeURIComponent(raw)}`);

describe("refresh token rotation recovery", () => {
    beforeAll(async () => {
        replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
        process.env.MONGO_URI = replset.getUri();
        process.env.NODE_ENV = "test";
        process.env.MONGO_TLS = "false";
        process.env.MONGO_REQUIRE_TRANSACTIONS = "false";
        process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
        await connectDB();
    }, 60000);

    afterAll(async () => {
        try { await mongoose.connection.close(); } catch {}
        if (replset) await replset.stop();
    }, 30000);

    // Observed live: a refresh request was cut off after the server rotated the token, so the browser never
    // received the new cookie, kept the old one, and was signed out once the 30-second grace window passed.
    it("re-sends the same successor when a rotated token comes back within the grace window", async () => {
        await User.create({ name: "Rotation", email: "rotation@example.com", password: "Passw0rd!", isVerified: true });
        const login = await request(app).post("/api/auth/login").set("origin", origin).set("referer", `${origin}/`)
            .send({ email: "rotation@example.com", password: "Passw0rd!" }).expect(200);
        const original = refreshCookieFrom(login);
        expect(original).toBeTruthy();

        const first = await refreshWith(original).expect(200);
        const successor = refreshCookieFrom(first);
        expect(successor).toBeTruthy();
        expect(successor).not.toBe(original);

        // The response above is "lost": the client retries with the original token.
        const retry = await refreshWith(original).expect(200);
        expect(retry.body.token).toBeTruthy();
        expect(refreshCookieFrom(retry)).toBe(successor);

        // Only one successor exists, so the chain (and reuse detection) is unchanged.
        const user = await User.findOne({ email: "rotation@example.com" });
        expect(await RefreshToken.countDocuments({ user: user._id, replacedByTokenHash: "" })).toBe(1);

        // Once the successor is used, its predecessor no longer keeps a copy of it.
        const next = refreshCookieFrom(await refreshWith(successor).expect(200));
        expect(next).toBeTruthy();
        const predecessor = await RefreshToken.findOne({ tokenHash: hashOpaqueToken(original) }).select("+graceSuccessor").lean();
        expect(predecessor.graceSuccessor).toBe("");
    });

    it("still rejects a rotated token after the grace window", async () => {
        await User.create({ name: "Expired grace", email: "expired-grace@example.com", password: "Passw0rd!", isVerified: true });
        const login = await request(app).post("/api/auth/login").set("origin", origin).set("referer", `${origin}/`)
            .send({ email: "expired-grace@example.com", password: "Passw0rd!" }).expect(200);
        const original = refreshCookieFrom(login);
        await refreshWith(original).expect(200);
        await RefreshToken.updateOne({ tokenHash: hashOpaqueToken(original) }, { $set: { rotationGraceUntil: new Date(Date.now() - 1000) } });

        await refreshWith(original).expect(401);
    });
});
