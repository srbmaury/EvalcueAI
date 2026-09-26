import { expect, test } from "./fixtures.js";

const json = (route, body, status = 200) => route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
});

test("public header navigation renders while session restoration is still pending", { tag: "@desktop-only" }, async ({ page }) => {
    let releaseRefresh;
    const refreshPending = new Promise((resolve) => { releaseRefresh = resolve; });

    await page.route("**/api/auth/refresh", async (route) => {
        await refreshPending;
        return json(route, { message: "Unauthenticated" }, 401);
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    try {
        await expect(page.getByRole("link", { name: "Practice", exact: true })).toBeVisible({ timeout: 1000 });
        await expect(page.getByRole("link", { name: "Hire", exact: true })).toBeVisible({ timeout: 1000 });
        await expect(page.getByRole("button", { name: "Toggle theme" })).toBeVisible({ timeout: 1000 });
    } finally {
        releaseRefresh();
    }
});
