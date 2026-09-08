import { expect, test } from "@playwright/test";

const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const mockSignedIn = async (page) => {
    await page.route("**/api/auth/refresh", (route) => json(route, { token: "test-access-token" }));
    await page.route("**/api/auth/profile", (route) => json(route, { _id: "user-1", name: "Practice User", email: "practice@example.com", role: "user", practicePlan: "free" }));
    await page.route("**/api/organizations", (route) => json(route, { organizations: [] }));
};

test("resume matcher opens the detailed review through canonical Practice routes", async ({ page }) => {
    await mockSignedIn(page);
    const resume = { _id: "resume-1", fileName: "Backend Resume.pdf", fileType: "application/pdf", fileUrl: "/api/resumes/resume-1/download", createdAt: "2026-09-01T00:00:00Z" };
    await page.route("**/api/resumes**", async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith("/api/resumes/match")) {
            return json(route, {
                resumeCount: 1,
                methodology: "Compared parsed resume sections to the job description.",
                matches: [{ resumeId: "resume-1", fileName: resume.fileName, score: 91, matchedKeywords: ["Redis"], missingKeywords: ["Kafka"], evidence: ["Built backend services"] }],
            });
        }
        if (url.pathname.endsWith("/api/resumes")) return json(route, [resume]);
        return route.continue();
    });

    await page.goto("/practice/resume-match");
    await expect(page.getByRole("heading", { name: "Find your best resume for a job" })).toBeVisible();
    await page.getByRole("textbox", { name: /Target role/i }).last().fill("Backend Engineer");
    await page.getByRole("textbox", { name: /Job description/i }).last().fill("Backend Engineer role requiring Java, Redis, PostgreSQL, APIs, testing, observability, and production debugging experience.");
    await page.getByRole("button", { name: "Find best resume" }).click();
    await expect(page.getByText("91% match")).toBeVisible();

    await page.getByRole("button", { name: "Run detailed AI review" }).click();
    await expect(page).toHaveURL(/\/practice\/resume-review$/);
    await expect(page.getByRole("heading", { name: "AI resume review" })).toBeVisible();
    await expect(page.getByText("Selected resume")).toBeVisible();
    await expect(page.getByText("Backend Resume.pdf").first()).toBeVisible();
    await expect(page.getByRole("textbox", { name: /^Target role$/i }).last()).toHaveValue("Backend Engineer");
    await expect(page.getByRole("textbox", { name: /^Job description$/i }).last()).toHaveValue(/PostgreSQL/);
});
