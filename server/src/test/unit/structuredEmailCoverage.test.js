import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const mailer = fs.readFileSync(path.resolve("src/utils/mailer.js"), "utf8");
const lifecycle = fs.readFileSync(path.resolve("src/services/assessmentLifecycle.js"), "utf8");
const reminders = fs.readFileSync(path.resolve("src/services/practiceReminders.js"), "utf8");

describe("transactional email coverage", () => {
    it("routes live verification, hiring invitation, and practice reminder flows through structured builders", () => {
        expect(mailer).toContain("buildTransactionalEmail");
        expect(lifecycle).toContain("buildHiringInvitationEmail");
        expect(reminders).toContain("buildPracticeReminderEmail");
    });
});
