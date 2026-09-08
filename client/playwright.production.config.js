import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./e2e",
    testMatch: "productionSmoke.spec.js",
    fullyParallel: false,
    workers: 1,
    retries: 1,
    timeout: 60000,
    expect: { timeout: 15000 },
    reporter: [
        ["line"],
        ["html", { outputFolder: "playwright-report-production", open: "never" }],
    ],
    use: {
        ...devices["Desktop Chrome"],
        headless: true,
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        video: "retain-on-failure",
        navigationTimeout: 30000,
        actionTimeout: 15000,
    },
});
