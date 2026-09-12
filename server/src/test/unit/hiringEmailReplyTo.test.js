import { describe, expect, it } from "vitest";
import { buildHiringInvitationEmail } from "../../utils/hiringInvitationEmail.js";

describe("hiring invitation reply-to", () => {
    it("omits an override when the assessment has no support address", () => {
        const mail = buildHiringInvitationEmail({ candidateEmail: "a@example.com", assessmentTitle: "Test", jobRole: "Engineer", candidateLink: "https://example.com" });
        expect(mail.replyTo).toBeUndefined();
    });
});
