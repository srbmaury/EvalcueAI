import { afterEach, describe, expect, it, vi } from "vitest";
import originCheck from "../../middleware/originCheck.js";

const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() });
const request = (overrides = {}) => ({
    method: "POST",
    path: "/api/auth/login",
    get: (name) => ({ origin: overrides.origin, referer: overrides.referer }[name.toLowerCase()]),
    ...overrides,
});

describe("originCheck middleware", () => {
    const previousEnv = process.env.NODE_ENV;
    const previousAllowed = process.env.ALLOWED_ORIGINS;

    afterEach(() => {
        process.env.NODE_ENV = previousEnv;
        process.env.ALLOWED_ORIGINS = previousAllowed;
        delete process.env.ORIGIN_CHECK_ENFORCE;
    });

    const useAllowedOrigin = (origin) => {
        process.env.ALLOWED_ORIGINS = origin;
    };

    it("does not enforce outside production unless explicitly requested", () => {
        process.env.NODE_ENV = "test";
        const next = vi.fn();
        originCheck()(request({ origin: "https://attacker.example" }), response(), next);
        expect(next).toHaveBeenCalledOnce();
    });

    it("allows a matching same-origin request in production", () => {
        process.env.NODE_ENV = "production";
        useAllowedOrigin("https://app.evalcueai.com");
        const next = vi.fn();
        originCheck()(request({ origin: "https://app.evalcueai.com" }), response(), next);
        expect(next).toHaveBeenCalledOnce();
    });

    it("blocks a cross-site Origin in production", () => {
        process.env.NODE_ENV = "production";
        useAllowedOrigin("https://app.evalcueai.com");
        const res = response();
        const next = vi.fn();
        originCheck()(request({ origin: "https://attacker.example" }), res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it("blocks a state-changing request with neither Origin nor Referer in production (no CSRF-token layer to fall back on)", () => {
        process.env.NODE_ENV = "production";
        useAllowedOrigin("https://app.evalcueai.com");
        const res = response();
        const next = vi.fn();
        originCheck()(request({}), res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it("never enforces GET/HEAD/OPTIONS requests", () => {
        process.env.NODE_ENV = "production";
        const next = vi.fn();
        originCheck()(request({ method: "GET" }), response(), next);
        expect(next).toHaveBeenCalledOnce();
    });
});
