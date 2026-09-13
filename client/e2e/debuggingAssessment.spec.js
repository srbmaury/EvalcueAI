import { expect, test } from "@playwright/test";

const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

test("candidate navigates a project tree and runs recruiter-named tests without seeing test files", async ({ page }) => {
    const shareToken = "share-debugging-project-journey";
    const attemptToken = "debug-attempt-token";
    const attemptId = "attempt-debug";
    let runCalls = 0;

    await page.route("**/api/auth/refresh", (route) => json(route, { message: "Unauthenticated" }, 401));
    await page.route(`**/api/assessments/public/${shareToken}`, (route) => json(route, {
        title: "Production debugging",
        jobRole: "Backend Engineer",
        durationMinutes: 45,
        capabilities: { codeExecution: true, transcription: false, debuggingAssessments: true },
        integrity: { enabled: false },
        rounds: [{ name: "Debugging", deliveryMode: "debugging", questionCount: 1, debugging: { responseMode: "code_fix", runtime: "node-22", sourceFileCount: 3, hiddenTestCount: 2 } }],
    }));
    await page.route(`**/api/assessments/public/${shareToken}/start`, (route) => json(route, {
        attemptToken,
        attempt: {
            _id: attemptId,
            startedAt: new Date().toISOString(),
            rounds: [{ _id: "r1", name: "Debugging", deliveryMode: "debugging", questions: [{ _id: "q1", text: "Fix duplicate processing.", answer: "" }] }],
        },
    }, 201));
    await page.route(`**/api/assessments/public/${shareToken}/attempts/${attemptId}/debugging/0`, (route) => json(route, {
        responseMode: "code_fix",
        runtime: "node-22",
        instructions: "Fix duplicate processing.",
        baseFiles: [
            { path: "demo/src.js", content: "export const demo = true;", kind: "source" },
            { path: "src/index.js", content: "export const run = () => false;", kind: "source" },
            { path: "src/services/payment.js", content: "export const charge = () => true;", kind: "source" },
        ],
        files: [
            { path: "demo/src.js", content: "export const demo = true;", kind: "source" },
            { path: "src/index.js", content: "export const run = () => false;", kind: "source" },
            { path: "src/services/payment.js", content: "export const charge = () => true;", kind: "source" },
        ],
        testRuns: [],
    }));
    await page.route(`**/api/assessments/public/${shareToken}/attempts/${attemptId}/debugging/0/workspace`, (route) => json(route, {
        responseMode: "code_fix",
        runtime: "node-22",
        instructions: "Fix duplicate processing.",
        baseFiles: [
            { path: "demo/src.js", content: "export const demo = true;", kind: "source" },
            { path: "src/index.js", content: "export const run = () => false;", kind: "source" },
            { path: "src/services/payment.js", content: "export const charge = () => true;", kind: "source" },
        ],
        files: [
            { path: "demo/src.js", content: "export const demo = true;", kind: "source" },
            { path: "src/index.js", content: "export const run = () => false;", kind: "source" },
            { path: "src/services/payment.js", content: "export const charge = () => true;", kind: "source" },
        ],
        testRuns: [],
    }));
    await page.route(`**/api/assessments/public/${shareToken}/attempts/${attemptId}/debugging/0/run-tests`, (route) => {
        runCalls += 1;
        expect(route.request().headers()["x-attempt-token"]).toBe(attemptToken);
        return json(route, {
            status: "failed", passed: 1, total: 2,
            tests: [{ name: "creates payment once", passed: true }, { name: "prevents duplicate charge", passed: false }],
        });
    });

    await page.goto(`/assessment/${shareToken}`);
    await page.getByLabel("Full name").fill("Candidate One");
    await page.getByLabel("Email address").fill("candidate@example.com");
    await page.getByRole("checkbox").first().check();
    await page.getByRole("button", { name: "Start assessment" }).click();

    await expect(page.getByRole("heading", { name: "Fix duplicate processing." })).toBeVisible();
    await expect(page.getByTestId("project-folder:demo")).toContainText("demo");
    await expect(page.getByRole("button", { name: "demo/src.js" })).toBeVisible();
    await expect(page.getByTestId("project-folder:src/services")).toContainText("services");
    await expect(page.getByRole("button", { name: "src/services/payment.js" })).toBeVisible();
    await expect(page.getByText("tests/duplicate.test.js")).toHaveCount(0);

    await page.getByRole("button", { name: "Run tests" }).click();
    await expect.poll(() => runCalls).toBe(1);
    await expect(page.getByText("1/2 tests passed")).toBeVisible();
    await expect(page.getByText("creates payment once")).toBeVisible();
    await expect(page.getByText("prevents duplicate charge")).toBeVisible();
});
