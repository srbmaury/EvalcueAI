import { expect, test } from "@playwright/test";
import process from "node:process";

const config = {
    landingOrigin: process.env.E2E_LANDING_ORIGIN || "https://evalcueai.com",
    practiceOrigin: process.env.E2E_PRACTICE_ORIGIN || "https://practice.evalcueai.com",
    hiringOrigin: process.env.E2E_HIRING_ORIGIN || "https://hiring.evalcueai.com",
    apiOrigin: process.env.E2E_API_ORIGIN || "https://api.evalcueai.com",
    password: process.env.E2E_SHARED_PASSWORD || "",
    candidateEmail: process.env.E2E_CANDIDATE_EMAIL || "",
    ownerEmail: process.env.E2E_HIRING_OWNER_EMAIL || "",
    reviewerEmail: process.env.E2E_HIRING_REVIEWER_EMAIL || "",
    adminEmail: process.env.E2E_ADMIN_EMAIL || "",
};

const requiredCredentials = [
    ["E2E_SHARED_PASSWORD", config.password],
    ["E2E_CANDIDATE_EMAIL", config.candidateEmail],
    ["E2E_HIRING_OWNER_EMAIL", config.ownerEmail],
];

const assertCredentials = () => {
    const missing = requiredCredentials.filter(([, value]) => !value).map(([name]) => name);
    expect(missing, `Missing production smoke credentials: ${missing.join(", ")}`).toEqual([]);
};

const login = async ({ page, origin, email, loginPath, expectedPath }) => {
    await page.goto(`${origin}${loginPath}`);
    await page.getByLabel("Email").fill(email);
    await page.locator('input[type="password"]').fill(config.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${expectedPath.replaceAll("/", "\\/")}(?:[?#].*)?$`));
};

const expectNoHorizontalOverflow = async (page) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
};

test.describe("production public surfaces", () => {
    test("landing, Practice, and Hiring surfaces are independently reachable", async ({ page }) => {
        const surfaces = [
            [config.landingOrigin, /Prepare better|Evalcue AI/i],
            [`${config.practiceOrigin}/practice`, /Practice for the interview/i],
            [`${config.hiringOrigin}/hire`, /Hire with clearer evidence|Technical hiring/i],
        ];

        for (const [url, heading] of surfaces) {
            await page.goto(url);
            await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
            await expectNoHorizontalOverflow(page);
        }
    });

    test("legal, documentation, and SEO entry points render", async ({ page }) => {
        const pages = [
            [`${config.landingOrigin}/docs`, /documentation|Evalcue/i],
            [`${config.landingOrigin}/privacy`, /Privacy/i],
            [`${config.landingOrigin}/terms`, /Terms/i],
            [`${config.practiceOrigin}/practice/resources/system-design-interview-questions`, /System Design Interview Questions/i],
            [`${config.hiringOrigin}/hire/resources/technical-assessment-template`, /Technical Assessment Template/i],
        ];

        for (const [url, heading] of pages) {
            await page.goto(url);
            await expect(page.getByRole("heading", { level: 1 }).or(page.getByRole("heading", { level: 2 })).first()).toContainText(heading);
            await expectNoHorizontalOverflow(page);
        }
    });

    test("API liveness and required dependencies are healthy", async ({ request }) => {
        const liveness = await request.get(`${config.apiOrigin}/health/liveness`);
        expect(liveness.status()).toBe(200);
        expect(await liveness.json()).toMatchObject({ status: "ok" });

        const readiness = await request.get(`${config.apiOrigin}/health/readiness`);
        expect(readiness.status()).toBe(200);
        expect(await readiness.json()).toMatchObject({
            status: "ok",
            components: { mongo: "up", redis: "up" },
        });
    });
});

test.describe("production authenticated Practice", () => {
    test.beforeEach(() => assertCredentials());

    test("candidate can sign in, reload, and open core Practice screens", async ({ page }) => {
        await login({ page, origin: config.practiceOrigin, email: config.candidateEmail, loginPath: "/practice/login", expectedPath: "/practice/dashboard" });
        await page.reload();
        await expect(page).toHaveURL(/\/practice\/dashboard$/);

        const screens = [
            ["/practice/profile", /Profile & settings/i],
            ["/practice/progress", /progress/i],
            ["/practice/resumes", /Resumes/i],
            ["/practice/resume-review", /resume review/i],
            ["/practice/company-insights", /Company interview insights/i],
        ];

        for (const [path, heading] of screens) {
            await page.goto(`${config.practiceOrigin}${path}`);
            await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
            await expectNoHorizontalOverflow(page);
        }
    });
});

test.describe("production authenticated Hiring", () => {
    test.beforeEach(() => assertCredentials());

    test("owner can sign in and access assessments, candidates, and team management", async ({ page }) => {
        await login({ page, origin: config.hiringOrigin, email: config.ownerEmail, loginPath: "/hire/login", expectedPath: "/hire/assessments" });
        await expect(page.getByRole("heading", { name: /Overview|Hiring workspace/i })).toBeVisible();

        await page.goto(`${config.hiringOrigin}/hire/assessments#candidate-pipeline`);
        await expect(page.getByRole("heading", { name: "Candidate pipeline" })).toBeVisible();

        await page.goto(`${config.hiringOrigin}/hire/team`);
        await expect(page.getByRole("heading", { name: /Organization settings|Team/i })).toBeVisible();
        await expectNoHorizontalOverflow(page);
    });

    test("reviewer has read-only Hiring access", async ({ page }) => {
        test.skip(!config.reviewerEmail, "Set E2E_HIRING_REVIEWER_EMAIL to test reviewer permissions");
        await login({ page, origin: config.hiringOrigin, email: config.reviewerEmail, loginPath: "/hire/login", expectedPath: "/hire/assessments" });
        await expect(page.getByRole("button", { name: "New assessment" })).toHaveCount(0);
        await page.goto(`${config.hiringOrigin}/hire/team`);
        await expect(page).toHaveURL(/\/hire\/assessments#candidate-pipeline$/);
    });

    test("platform admin can reach administration screens", async ({ page }) => {
        test.skip(!config.adminEmail, "Set E2E_ADMIN_EMAIL to test platform administration");
        await login({ page, origin: config.landingOrigin, email: config.adminEmail, loginPath: "/login", expectedPath: "/practice/dashboard" });
        await page.goto(`${config.landingOrigin}/admin/feedback`);
        await expect(page.getByRole("heading", { name: "Product feedback" })).toBeVisible();
        await page.goto(`${config.landingOrigin}/admin/audit`);
        await expect(page.getByRole("heading", { name: "Audit activity" })).toBeVisible();
    });
});
