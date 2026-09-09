import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../app.js";

const previous = { ...process.env };

afterEach(() => {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
});

describe("public runtime config", () => {
    it("returns browser-safe identifiers without server secrets", async () => {
        process.env.NODE_ENV = "production";
        process.env.GOOGLE_CLIENT_ID = "google-client.apps.example";
        process.env.CAPTCHA_ENABLED = "true";
        process.env.CAPTCHA_PROVIDER = "turnstile";
        process.env.CAPTCHA_SITE_KEY = "public-site-key";
        process.env.CAPTCHA_SECRET = "private-secret";
        process.env.CAPTCHA_LOGIN_ENABLED = "true";

        const response = await request(app).get("/api/auth/public-config").expect(200);
        expect(response.body.google).toEqual({ enabled: true, clientId: "google-client.apps.example" });
        expect(response.body.captcha).toMatchObject({ enabled: true, provider: "turnstile", siteKey: "public-site-key", loginEnabled: true });
        expect(JSON.stringify(response.body)).not.toContain("private-secret");
    });
});
