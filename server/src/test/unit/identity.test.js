import { describe, expect, it } from "vitest";
import { emailDomain, normalizeDomain, normalizeEmail } from "../../utils/identity.js";

describe("identity normalization", () => {
    it("canonicalizes email identity consistently", () => {
        expect(normalizeEmail("  User.Name@Example.COM ")).toBe("user.name@example.com");
        expect(emailDomain("User.Name@Example.COM")).toBe("example.com");
    });

    it("canonicalizes SSO domains without accepting whitespace or case drift", () => {
        expect(normalizeDomain("  EXAMPLE.COM ")).toBe("example.com");
    });
});
