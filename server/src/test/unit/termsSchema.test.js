import { describe, expect, it } from "vitest";
import { GoogleIdTokenSchema, RegisterSchema } from "../../validation/authSchemas.js";

describe("account creation consent schemas", () => {
    it("requires explicit consent for email registration", () => {
        expect(RegisterSchema.safeParse({ name: "User", email: "user@example.com", password: "Passw0rd!" }).success).toBe(false);
        expect(RegisterSchema.safeParse({ name: "User", email: "user@example.com", password: "Passw0rd!", termsAccepted: true }).success).toBe(true);
    });

    it("allows Google login without consent while accepting it for signup", () => {
        expect(GoogleIdTokenSchema.safeParse({ idToken: "token" }).success).toBe(true);
        expect(GoogleIdTokenSchema.safeParse({ idToken: "token", termsAccepted: true }).success).toBe(true);
    });
});
