import { describe, expect, it } from "vitest";
import { buildTransactionalEmail } from "../../utils/transactionalEmail.js";

describe("transactional email structure", () => {
    it("renders a consistent branded structure in both html and text", () => {
        const mail = buildTransactionalEmail({
            subject: "Action required",
            preheader: "Complete the next step",
            greeting: "Hi Asha,",
            heading: "Complete your assessment",
            intro: "You have one action to complete.",
            cta: { label: "Open assessment", url: "https://example.com" },
            details: [{ label: "Role", value: "Backend Engineer" }],
            note: "Need help? Reply to this email.",
        });
        expect(mail.html).toContain("Evalcue AI");
        expect(mail.html).toContain("Open assessment");
        expect(mail.html).toContain("Backend Engineer");
        expect(mail.text).toContain("Action required");
        expect(mail.text).toContain("Open assessment: https://example.com");
        expect(mail.text).toContain("Backend Engineer");
        expect(mail.text).toContain("Evalcue AI");
    });
});
