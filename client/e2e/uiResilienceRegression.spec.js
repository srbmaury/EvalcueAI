import { expect, test } from "@playwright/test";

const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const recruiter = { _id: "recruiter-ui", name: "Recruiter UI", email: "ui@example.com", role: "user", practicePlan: "free" };
const assessment = {
    _id: "a1", title: "Backend screen", status: "active", jobRole: "Backend Engineer", jobDescription: "Backend role",
    shareToken: "share-a1", durationMinutes: 30, timezone: "UTC", followUpsEnabled: true, inviteOnly: false,
    invitations: [], rubric: [], integrity: { enabled: false }, updatedAt: "2026-09-12T10:00:00.000Z",
    rounds: [{ _id: "r1", name: "Interview", description: "Backend", deliveryMode: "conversational", questions: [{ _id: "q1", text: "Design an API." }] }],
};

const mockSignedIn = async (page) => {
    await page.route("**/api/auth/refresh", (route) => json(route, { token: "access-token" }));
    await page.route("**/api/auth/profile", (route) => json(route, recruiter));
    await page.route("**/api/auth/reminders/deliveries", (route) => json(route, { items: [] }));
    await page.route("**/api/organizations", (route) => json(route, { organizations: [{ _id: "org-1", name: "Acme Hiring", role: "owner", memberCount: 1 }] }));
};

test("theme choice persists through reload and navigation", { tag: "@desktop-only" }, async ({ page }) => {
    await page.route("**/api/auth/refresh", (route) => json(route, { message: "Unauthenticated" }, 401));
    await page.goto("/");

    const initial = await page.locator("html").getAttribute("data-theme");
    await page.getByRole("button", { name: "Toggle theme" }).click();
    const changed = initial === "dark" ? "light" : "dark";
    await expect(page.locator("html")).toHaveAttribute("data-theme", changed);

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", changed);
    await page.getByRole("link", { name: "Practice", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", changed);
});

test("assessment report API failure renders a recoverable error instead of a blank screen", async ({ page }) => {
    await mockSignedIn(page);
    await page.route("**/api/assessments/a1", (route) => json(route, { message: "Temporary report failure" }, 500));

    await page.goto("/hire/assessments/a1");
    await expect(page.getByText("This assessment or its reports could not be loaded.", { exact: true })).toBeVisible();
    await expect(page.locator("main")).toBeVisible();
});

test("failed invitation request keeps candidate emails and exposes the server error for retry", async ({ page }) => {
    await mockSignedIn(page);
    await page.route("**/api/assessments/a1", (route) => json(route, { assessment, attempts: [] }));
    await page.route("**/api/assessments/a1/invitations", (route) => json(route, { message: "Email provider temporarily unavailable" }, 503));

    await page.goto("/hire/assessments/a1");
    const input = page.getByLabel("Candidate emails");
    await input.fill("candidate@example.com");
    await page.getByRole("button", { name: "Send invitations" }).click();

    await expect(page.getByText("Email provider temporarily unavailable", { exact: true })).toBeVisible();
    await expect(input).toHaveValue("candidate@example.com");
    await expect(page.getByRole("button", { name: "Send invitations" })).toBeEnabled();
});
