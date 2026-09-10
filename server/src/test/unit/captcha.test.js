import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.mock("node-fetch", () => ({ default: fetchMock }));

const { default: captcha } = await import("../../middleware/captcha.js");

describe("captcha middleware", () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        fetchMock.mockReset();
        process.env.NODE_ENV = "production";
        process.env.CAPTCHA_ENABLED = "true";
        process.env.CAPTCHA_PROVIDER = "turnstile";
        process.env.CAPTCHA_SECRET = "secret";
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it("returns a retry-specific code for consumed or expired Turnstile tokens", async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ success: false, "error-codes": ["timeout-or-duplicate"] }),
        });
        const req = { body: { captchaToken: "token" }, get: vi.fn(), ip: "127.0.0.1", log: { warn: vi.fn() } };
        const json = vi.fn();
        const res = { status: vi.fn(() => ({ json })) };
        const next = vi.fn();

        await captcha()(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: "CAPTCHA_RETRY_REQUIRED" }));
        expect(next).not.toHaveBeenCalled();
    });
});
