import { describe, expect, it } from "vitest";
import { cleanSourceSnippet } from "../../utils/sourceSnippet.js";

describe("cleanSourceSnippet", () => {
    it("removes navigation chrome and the repeated page title", () => {
        const title = "Stripe SWE Interview Experience (Fulltime Onsite NYC) : r/InterviewCoderHQ";
        const content = `Skip to main content${title} Open menu Open navigation I interviewed with Stripe for a backend role.`;
        expect(cleanSourceSnippet(content, title)).toBe("I interviewed with Stripe for a backend role.");
    });

    it("keeps ordinary interview text intact", () => {
        const text = "The onsite had a bug bash, an integration round, and a system design round on payments.";
        expect(cleanSourceSnippet(text, "Stripe interview")).toBe(text);
    });
});
