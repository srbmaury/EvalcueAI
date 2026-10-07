import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../app.js";

describe("API host search indexing", () => {
    it("marks the root redirect as noindex", async () => {
        const response = await request(app).get("/").expect(301);
        expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
    });

    it("marks API responses as noindex", async () => {
        const health = await request(app).get("/health/liveness").expect(200);
        expect(health.headers["x-robots-tag"]).toBe("noindex, nofollow");
        const missing = await request(app).get("/api/does-not-exist");
        expect(missing.headers["x-robots-tag"]).toBe("noindex, nofollow");
    });
});
