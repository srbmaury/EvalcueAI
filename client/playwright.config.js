import { defineConfig, devices } from "@playwright/test";
import process from "node:process";

const webServerCommand = process.env.CI
    ? "npm run preview -- --host 127.0.0.1 --port 4173"
    : "npm run dev -- --host 127.0.0.1 --port 4173";

export default defineConfig({
    testDir: "./e2e",
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 2 : undefined,
    reporter: process.env.CI
        ? [["line"], ["junit", { outputFile: "test-results/e2e-junit.xml" }], ["html", { outputFolder: "playwright-report", open: "never" }]]
        : "list",
    use: {
        baseURL: "http://127.0.0.1:4173",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        video: "retain-on-failure",
    },
    projects: [
        { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
        { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
    ],
    webServer: {
        // CI already builds immediately before Playwright. Serving that optimized
        // output avoids dev-server transform contention between parallel browsers.
        command: webServerCommand,
        url: "http://127.0.0.1:4173",
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
    },
});
