import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

describe("candidate assessment CAPTCHA contract", () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

    it("protects candidate starts server-side and renders the runtime CAPTCHA client-side", () => {
        const routes = fs.readFileSync(path.join(root, "server/src/routes/assessmentRoutes.js"), "utf8");
        const page = fs.readFileSync(path.join(root, "client/src/pages/CandidateAssessmentPage.jsx"), "utf8");
        expect(routes).toContain('router.post("/public/:shareToken/start"');
        expect(routes).toContain("captcha()");
        expect(page).toContain("candidateCaptchaEnabled");
        expect(page).toContain("captchaToken");
        expect(page).toContain("<Captcha enabled={candidateCaptchaEnabled}");
    });
});
