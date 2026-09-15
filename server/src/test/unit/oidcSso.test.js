import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOidcLoginState, decryptSsoSecret, encryptSsoSecret, hashSsoToken, normalizeSsoDomain } from "../../services/oidcSso.js";
import { refreshCookieOptions } from "../../utils/tokens.js";

describe("OIDC SSO security helpers", () => {
    const previousKey = process.env.SSO_ENCRYPTION_KEY;
    const previousNodeEnv = process.env.NODE_ENV;
    const previousSameSite = process.env.COOKIE_SAMESITE;

    beforeEach(() => {
        process.env.SSO_ENCRYPTION_KEY = "test-only-sso-encryption-key-that-is-long-enough";
    });

    afterEach(() => {
        if (previousKey === undefined) delete process.env.SSO_ENCRYPTION_KEY;
        else process.env.SSO_ENCRYPTION_KEY = previousKey;
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
        if (previousSameSite === undefined) delete process.env.COOKIE_SAMESITE;
        else process.env.COOKIE_SAMESITE = previousSameSite;
    });

    it("creates independent state, nonce, and PKCE verifier values", () => {
        const first = createOidcLoginState();
        const second = createOidcLoginState();
        expect(first.state).not.toBe(second.state);
        expect(first.nonce).not.toBe(first.state);
        expect(first.codeVerifier).not.toBe(first.state);
        expect(first.codeChallenge).not.toBe(first.codeVerifier);
        expect(first.stateHash).toBe(hashSsoToken(first.state));
    });

    it("encrypts client secrets with authenticated encryption", () => {
        const encrypted = encryptSsoSecret("super-secret-value");
        expect(encrypted).not.toContain("super-secret-value");
        expect(decryptSsoSecret(encrypted)).toBe("super-secret-value");
    });

    it("normalizes work email domains", () => {
        expect(normalizeSsoDomain(" @Example.COM ")).toBe("example.com");
    });

    it("uses the same strict, secure refresh cookie config as password/Google login (SSO exchange is a same-site XHR, not a cross-site redirect)", () => {
        process.env.NODE_ENV = "production";
        delete process.env.COOKIE_SAMESITE;
        expect(refreshCookieOptions()).toMatchObject({ httpOnly: true, secure: true, sameSite: "strict", path: "/api/auth" });
    });
});
