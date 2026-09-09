import { describe, expect, it } from "vitest";
import { emailDomain, normalizeEmail, normalizeSsoDomain } from "../../utils/identity.js";

describe("identity normalization", () => {
    it("canonicalizes email identity consistently", () => {
        expect(normalizeEmail("  User.Name@Example.COM ")).toBe("user.name@example.com");
        expect(emailDomain("User.Name@Example.COM")).toBe("example.com");
    });

    it("canonicalizes SSO domains without accepting whitespace or case drift", () => {
        expect(normalizeSsoDomain("  EXAMPLE.COM ")).toBe("example.com");
    });
});
