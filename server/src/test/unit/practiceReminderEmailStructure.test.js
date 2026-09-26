import { describe, expect, it } from "vitest";
import { buildPracticeReminderEmail } from "../../utils/practiceReminderEmail.js";

describe("practice reminder email", () => {
    it("uses the shared transactional structure and preserves session links", () => {
        const mail = buildPracticeReminderEmail({
            name: "Asha",
            email: "asha@example.com",
            role: "Backend Engineer",
            dashboard: "https://practice.evalcueai.com/practice/dashboard",
            sessions: [
                { number: 1, title: "Caching interview", focus: "Redis and invalidation", url: "https://practice.evalcueai.com/session/1" },
                { number: 2, title: "Distributed systems", focus: "Consistency", url: "https://practice.evalcueai.com/session/2" },
            ],
        });
        expect(mail.to).toBe("asha@example.com");
        expect(mail.html).toContain("EvalcueAI");
        expect(mail.text).toContain("Caching interview");
        expect(mail.text).toContain("https://practice.evalcueai.com/session/1");
        expect(mail.text).toContain("https://practice.evalcueai.com/practice/dashboard");
        expect(mail.html).toContain('href="https://practice.evalcueai.com/session/1"');
        expect(mail.html).toContain("Start session 1");
        expect(mail.html).not.toMatch(/>https?:\/\//);
    });
});
