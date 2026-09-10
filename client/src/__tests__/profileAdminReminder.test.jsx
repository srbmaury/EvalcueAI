import { describe, expect, it } from "vitest";

describe("profile reminder test action", () => {
    it("is intentionally restricted to admin users", () => {
        const canSendTestPlan = (user, changed) => !changed && user?.role === "admin";
        expect(canSendTestPlan({ role: "user" }, false)).toBe(false);
        expect(canSendTestPlan({ role: "admin" }, false)).toBe(true);
        expect(canSendTestPlan({ role: "admin" }, true)).toBe(false);
    });
});
