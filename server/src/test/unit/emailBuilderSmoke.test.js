import { describe, expect, it } from "vitest";
import { buildTransactionalEmail } from "../../utils/transactionalEmail.js";
import { buildHiringInvitationEmail } from "../../utils/hiringInvitationEmail.js";
import { buildPracticeReminderEmail } from "../../utils/practiceReminderEmail.js";

describe("transactional email builders", () => {
    it("return html and text alternatives", () => {
        const base = buildTransactionalEmail({ subject: "Test", heading: "Test" });
        const hiring = buildHiringInvitationEmail({ candidateEmail: "a@example.com", assessmentTitle: "Test", jobRole: "Engineer", candidateLink: "https://example.com" });
        const practice = buildPracticeReminderEmail({ email: "a@example.com", dashboard: "https://example.com", sessions: [] });
        for (const mail of [base, hiring, practice]) {
            expect(mail.html).toBeTruthy();
            expect(mail.text).toBeTruthy();
        }
    });
});
