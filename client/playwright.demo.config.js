import { defineConfig, devices } from "@playwright/test";

// Marketing recordings, not tests. Kept out of CI (the main config's testDir is ./e2e).
// Run: npm run demo:record            (all demos)
//      npm run demo:record -- -g debug (one demo by title)
const size = { width: 1440, height: 900 };

export default defineConfig({
    testDir: "./e2e-demo",
    testMatch: "**/*.demo.js",
    outputDir: "demo-recordings/.playwright",
    fullyParallel: false,
    workers: 1,
    retries: 0,
    timeout: 240000,
    reporter: "list",
    use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:4173",
        viewport: size,
        deviceScaleFactor: 1,
        colorScheme: "light",
        video: { mode: "on", size },
        trace: "off",
    },
    webServer: {
        command: "npm run dev -- --host 127.0.0.1 --port 4173",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: true,
        timeout: 120000,
    },
});
