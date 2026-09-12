import { expect, test } from "@playwright/test";

const json = (route, body, status = 200) => route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
});

test("public header navigation renders while session restoration is still pending", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Desktop header regression test");

    let releaseRefresh;
    const refreshPending = new Promise((resolve) => { releaseRefresh = resolve; });

    await page.route("**/api/auth/refresh", async (route) => {
        await refreshPending;
        return json(route, { message: "Unauthenticated" }, 401);
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("link", { name: "Practice", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Hire", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Toggle theme" })).toBeVisible();

    releaseRefresh();
});
