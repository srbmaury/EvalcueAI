import { expect, test } from "@playwright/test";

const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const mockSignedIn = async (page) => {
    await page.route("**/api/auth/refresh", (route) => json(route, { token: "test-access-token" }));
    await page.route("**/api/auth/profile", (route) => json(route, {
        _id: "user-1",
        name: "Mobile User",
        email: "mobile@example.com",
        role: "user",
        practicePlan: "free",
    }));
    await page.route("**/api/organizations**", (route) => json(route, {
        organizations: [{ _id: "org-1", name: "Acme Hiring", role: "owner", memberCount: 1 }],
    }));
    await page.route("**/api/events", (route) => json(route, { recorded: true }, 201));
};

const openNavigation = async (page) => {
    await page.getByRole("button", { name: "Open navigation" }).click();
};

const closeMenu = async (page) => {
    await page.keyboard.press("Escape");
};

test("mobile navigation exposes product destinations once without duplicate billing", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Mobile navigation regression test");
    await mockSignedIn(page);

    await page.goto("/hire");
    await openNavigation(page);
    await expect(page.getByRole("menuitem", { name: "Practice" })).toHaveCount(1);
    await expect(page.getByRole("menuitem", { name: "Hire" })).toHaveCount(1);
    await expect(page.getByRole("menuitem", { name: "Team & billing" })).toHaveCount(1);
    await expect(page.getByRole("menuitem", { name: /Open Evalcue AI Practice/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Account menu" })).toHaveCount(0);
    await closeMenu(page);

    await page.goto("/practice");
    await openNavigation(page);
    await expect(page.getByRole("menuitem", { name: "Practice" })).toHaveCount(1);
    await expect(page.getByRole("menuitem", { name: "Hire" })).toHaveCount(1);
    await expect(page.getByRole("menuitem", { name: "Profile" })).toHaveCount(1);
    await expect(page.getByRole("menuitem", { name: /Open Evalcue AI Hire/i })).toHaveCount(0);
    await expect(page.getByText(/practice plans & billing/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Account menu" })).toHaveCount(0);
    await closeMenu(page);

    await page.goto("/privacy");
    await openNavigation(page);
    await expect(page.getByRole("menuitem", { name: "Practice" })).toHaveCount(1);
    await expect(page.getByRole("menuitem", { name: "Hire" })).toHaveCount(1);
    await expect(page.getByRole("menuitem", { name: "Profile & settings" })).toHaveCount(1);
    await expect(page.getByText(/billing/i)).toHaveCount(0);
    await expect(page.getByText(/workspace/i)).toHaveCount(0);
});