import { describe, expect, it } from "vitest";
import { normalizeEnvironment } from "../../config/bootstrapEnv.js";

describe("production CAPTCHA configuration", () => {
    it("requires the browser site key when CAPTCHA enforcement is enabled", () => {
        expect(() => normalizeEnvironment({ NODE_ENV: "production", CAPTCHA_ENABLED: "true", CAPTCHA_SITE_KEY: "" }))
            .toThrow(/CAPTCHA_SITE_KEY/);
    });

    it("accepts a configured public site key", () => {
        const env = { NODE_ENV: "production", CAPTCHA_ENABLED: "true", CAPTCHA_SITE_KEY: "site-key" };
        expect(normalizeEnvironment(env)).toBe(env);
    });
});
