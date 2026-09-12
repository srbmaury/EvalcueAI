import { expect, test } from "@playwright/test";

const json = (route, body, status = 200) => route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
});

const desktopOnly = (testInfo) => test.skip(testInfo.project.name !== "desktop-chromium", "Product boundary regression test");

const mockSignedOut = async (page) => {
    await page.route("**/api/auth/refresh", (route) => json(route, { message: "Unauthenticated" }, 401));
};

const mockSignedIn = async (page) => {
    await page.route("**/api/auth/refresh", (route) => json(route, { token: "test-access-token" }));
    await page.route("**/api/auth/profile", (route) => json(route, {
        _id: "user-1",
        name: "Boundary Tester",
        email: "boundary@example.com",
        role: "user",
        practicePlan: "pro",
    }));
    await page.route("**/api/auth/reminders/deliveries", (route) => json(route, { items: [] }));
    await page.route("**/api/organizations", (route) => json(route, {
        organizations: [{ _id: "org-1", name: "Acme Hiring", role: "owner", memberCount: 1 }],
    }));
};

test("canonical Practice and Hiring auth routes override a contradictory workspace query", async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await mockSignedOut(page);

    await page.goto("/practice/login?workspace=hiring");
    await expect(page.getByRole("heading", { name: "Sign in to Evalcue AI Practice" })).toBeVisible();
    await expect(page.getByRole("button", { name: /work sso/i })).toHaveCount(0);

    await page.goto("/hire/login?workspace=practice");
    await expect(page.getByRole("heading", { name: "Sign in to Evalcue AI Hire" })).toBeVisible();

    await page.goto("/practice/register?workspace=hiring");
    await expect(page.getByRole("heading", { name: /Evalcue AI Practice/i })).toBeVisible();

    await page.goto("/hire/register?workspace=practice");
    await expect(page.getByRole("heading", { name: /Evalcue AI Hire/i })).toBeVisible();
});

test("canonical billing-success route overrides a contradictory product query", async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await mockSignedIn(page);

    const calls = [];
    await page.route("**/api/billing/practice/entitlements", (route) => {
        calls.push("practice");
        return json(route, { plan: "pro", subscriptionStatus: "active" });
    });
    await page.route("**/api/billing/hiring/entitlements", (route) => {
        calls.push("hiring");
        return json(route, { plan: "growth", subscriptionStatus: "active" });
    });

    await page.goto("/practice/billing/success?product=hiring");
    await expect(page.getByText("Practice Pro is active on your account.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Continue to Practice" })).toHaveAttribute("href", "/practice/dashboard");
    expect(calls.at(-1)).toBe("practice");

    await page.goto("/hire/billing/success?product=practice&organizationId=org-1");
    await expect(page.getByText("Growth Hiring is active for this organization.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Continue to Hiring" })).toHaveAttribute("href", "/hire/team");
    expect(calls.at(-1)).toBe("hiring");
});
