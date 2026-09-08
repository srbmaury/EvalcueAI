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
    await page.route("**/api/resumes", (route) => json(route, [resume]));
    await page.route("**/api/resumes/match", async (route) => json(route, {
        resumeCount: 1,
        methodology: "Compared parsed resume sections to the job description.",
        matches: [{ resumeId: "resume-1", fileName: resume.fileName, score: 91, matchedKeywords: ["Redis"], missingKeywords: ["Kafka"], evidence: ["Built backend services"] }],
    }));

    await page.goto("/practice/resume-match");
    await expect(page.getByRole("heading", { name: "Find your best resume for a job" })).toBeVisible();
    await page.getByLabel("Target role").fill("Backend Engineer");
    await page.getByLabel("Job description").fill("Backend Engineer role requiring Java, Redis, PostgreSQL, APIs, testing, observability, and production debugging experience.");
    await page.getByRole("button", { name: "Find best resume" }).click();
    await expect(page.getByText("91% match")).toBeVisible();

    await page.getByRole("button", { name: "Run detailed AI review" }).click();
    await expect(page).toHaveURL(/\/practice\/resume-review$/);
    await expect(page.getByRole("heading", { name: "AI resume review" })).toBeVisible();
    await expect(page.getByText("Selected resume")).toBeVisible();
    await expect(page.getByText("Backend Resume.pdf")).toBeVisible();
    await expect(page.getByLabel("Target role")).toHaveValue("Backend Engineer");
    await expect(page.getByLabel("Job description")).toHaveValue(/PostgreSQL/);
});
