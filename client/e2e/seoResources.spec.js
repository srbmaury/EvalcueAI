import { expect, test } from "./fixtures.js";

const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

test("practice resource survives sign-in and prefills the real interview builder", async ({ page }) => {
    let authenticated = false;
    await page.route("**/api/auth/refresh", (route) => authenticated
        ? json(route, { token: "restored-token" })
        : json(route, { message: "Unauthenticated" }, 401));
    await page.route("**/api/auth/login", (route) => {
        authenticated = true;
        return json(route, { token: "access-token" });
    });
    await page.route("**/api/auth/profile", (route) => json(route, { _id: "user-seo", name: "SEO Visitor", email: "visitor@example.com", role: "user", practicePlan: "free" }));
    await page.route("**/api/resumes**", (route) => json(route, []));

    await page.goto("/practice/resources/system-design-interview-questions");
    await expect(page.getByRole("heading", { name: "System Design Interview Questions" })).toBeVisible();

    await page.getByLabel("Role you are preparing for").click();
    await page.getByRole("option", { name: "Senior Software Engineer" }).click();
    await page.getByLabel("Practice track").click();
    await page.getByRole("option", { name: "Design a notification service" }).click();
    await page.getByRole("button", { name: "Practice this in EvalcueAI" }).click();

    await expect(page).toHaveURL(/\/practice\/login$/);
    await page.getByLabel("Email").fill("visitor@example.com");
    await page.locator("input#password").fill("StrongPass1!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page).toHaveURL(/\/practice\/new$/);
    await expect(page.getByLabel("Job role")).toHaveValue("Senior Software Engineer");
    await expect(page.getByLabel("Job description")).toHaveValue(/global notification platform/i);
});

test("hiring resource creates an organization-owned draft assessment", async ({ page }) => {
    let createdPayload;
    await page.route("**/api/auth/refresh", (route) => json(route, { token: "test-access-token" }));
    await page.route("**/api/auth/profile", (route) => json(route, { _id: "recruiter-seo", name: "Recruiter SEO", email: "recruiter@example.com", role: "user", practicePlan: "free" }));
    await page.route("**/api/organizations", (route) => json(route, {
        organizations: [{ _id: "org-seo", name: "SEO Hiring", role: "owner", memberCount: 1 }],
    }));
    await page.route("**/api/billing/hiring/entitlements", (route) => json(route, {
        product: "hiring",
        organization: { _id: "org-seo", name: "SEO Hiring" },
        plan: "trial",
        subscriptionStatus: "inactive",
        period: "lifetime",
        periodType: "lifetime",
        limits: { candidateInterviews: 5 },
        used: { candidateInterviews: 0 },
        planLimits: {},
        prices: {},
        billingAvailable: {},
        canManageBilling: true,
    }));
    await page.route("**/api/assessments", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        createdPayload = await route.request().postDataJSON();
        return json(route, { _id: "assessment-seo", ...createdPayload }, 201);
    });
    await page.route("**/api/assessments/assessment-seo", (route) => json(route, {
        assessment: { _id: "assessment-seo", title: "Backend Engineer — Backend assessment", status: "draft", jobRole: "Backend Engineer", rounds: [] },
        attempts: [],
    }));

    await page.goto("/hire/resources/technical-assessment-template");
    await expect(page.getByRole("heading", { name: "Technical Assessment Template" })).toBeVisible();
    await page.getByRole("button", { name: "Use this in EvalcueAI Hire" }).click();

    await expect.poll(() => createdPayload?.templateName).toBe("Technical Assessment Template");
    expect(createdPayload?.status).toBe("draft");
    expect(createdPayload?.rounds?.length).toBeGreaterThan(0);
    await expect(page).toHaveURL(/\/hire\/assessments\/assessment-seo$/);
});
