import { describe, expect, it } from "vitest";
import { buildVerificationEmail } from "../../utils/mailer.js";

describe("verification email structure", () => {
    it("uses the shared branded transactional layout", () => {
        const mail = buildVerificationEmail("Asha", "https://practice.evalcueai.com/verify-email?token=abc");
        expect(mail.subject).toContain("Verify");
        expect(mail.html).toContain("EvalcueAI");
        expect(mail.html).toContain("Verify email");
        expect(mail.text).toContain("https://practice.evalcueai.com/verify-email?token=abc");
        expect(mail.text).toContain("24 hours");
    });
});
