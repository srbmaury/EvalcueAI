import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshCookieOptions } from "../../utils/tokens.js";

describe("refresh cookie domain", () => {
    const original = process.env.COOKIE_DOMAIN;
    afterEach(() => { process.env.COOKIE_DOMAIN = original; vi.restoreAllMocks(); });

    it("uses a valid configured domain", () => {
        process.env.COOKIE_DOMAIN = ".evalcueai.com";
        expect(refreshCookieOptions().domain).toBe(".evalcueai.com");
    });

    it("ignores a malformed domain so the browser keeps the cookie", () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        for (const value of ["4", "localhost", "127.0.0.1"]) {
            process.env.COOKIE_DOMAIN = value;
            expect(refreshCookieOptions().domain).toBeUndefined();
        }
    });
});
