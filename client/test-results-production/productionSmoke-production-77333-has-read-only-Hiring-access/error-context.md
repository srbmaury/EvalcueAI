# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: productionSmoke.spec.js >> production authenticated Hiring >> reviewer has read-only Hiring access
- Location: e2e/productionSmoke.spec.js:123:5

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/hire\/assessments(?:[?#].*)?$/
Received string:  "http://localhost:4174/hire/login"
Timeout: 15000ms

Call log:
  - Expect "toHaveURL" with timeout 15000ms
    9 × locator resolved to <html lang="en">…</html>
      - unexpected value "http://localhost:4174/hire/login"

```

```yaml
- link "Skip to main content":
  - /url: "#main-content"
- banner:
  - link "Evalcue AI Hire":
    - /url: /hire
    - paragraph: Evalcue AI
    - text: Hire
  - group "Choose Evalcue AI product":
    - button "Practice"
    - button "Hire"
  - link "Sign in":
    - /url: /hire/login
  - link "Start hiring":
    - /url: /hire/register
  - button "Toggle theme"
- main:
  - text: Evalcue AI Hire
  - heading "Collect stronger technical signal before the live panel." [level=3]
  - paragraph: Keep organization-owned assessments, candidate evidence, team access, and calibration inside a dedicated hiring product.
  - paragraph: Structured adaptive assessments
  - paragraph: Candidate pipeline and reports
  - paragraph: Human review and scoring calibration
  - text: Welcome back
  - heading "Sign in to Evalcue AI Hire" [level=1]
  - paragraph: Continue to your organization’s assessments, candidate evidence, and hiring reports.
  - text: Email
  - textbox "Email":
    - /placeholder: name@example.com
    - text: reviewer1@srbmaury.com
  - text: Password
  - textbox "Password":
    - /placeholder: ••••••••
    - text: [REDACTED]
  - button "Show password"
  - paragraph:
    - link "Forgot password?":
      - /url: /forgot-password?workspace=hiring
  - button "Signing in..." [disabled]
  - separator: OR CONTINUE WITH
  - button "Continue with work SSO" [disabled]
  - text: Work SSO is available for Evalcue AI Hire organizations. Google sign-in may not display in embedded browsers; use Chrome or Safari if needed.
  - paragraph:
    - text: Don’t have an account?
    - link "Register":
      - /url: /hire/register
```

# Test source

```ts
  1   | import { expect, test } from "@playwright/test";
  2   | import process from "node:process";
  3   | 
  4   | const config = {
  5   |     landingOrigin: process.env.E2E_LANDING_ORIGIN || "https://evalcueai.com",
  6   |     practiceOrigin: process.env.E2E_PRACTICE_ORIGIN || "https://practice.evalcueai.com",
  7   |     hiringOrigin: process.env.E2E_HIRING_ORIGIN || "https://hiring.evalcueai.com",
  8   |     apiOrigin: process.env.E2E_API_ORIGIN || "https://api.evalcueai.com",
  9   |     password: process.env.E2E_SHARED_PASSWORD || "",
  10  |     candidateEmail: process.env.E2E_CANDIDATE_EMAIL || "",
  11  |     ownerEmail: process.env.E2E_HIRING_OWNER_EMAIL || "",
  12  |     reviewerEmail: process.env.E2E_HIRING_REVIEWER_EMAIL || "",
  13  |     adminEmail: process.env.E2E_ADMIN_EMAIL || "",
  14  | };
  15  | 
  16  | const requiredCredentials = [
  17  |     ["E2E_SHARED_PASSWORD", config.password],
  18  |     ["E2E_CANDIDATE_EMAIL", config.candidateEmail],
  19  |     ["E2E_HIRING_OWNER_EMAIL", config.ownerEmail],
  20  | ];
  21  | 
  22  | const assertCredentials = () => {
  23  |     const missing = requiredCredentials.filter(([, value]) => !value).map(([name]) => name);
  24  |     expect(missing, `Missing production smoke credentials: ${missing.join(", ")}`).toEqual([]);
  25  | };
  26  | 
  27  | const login = async ({ page, origin, email, loginPath, expectedPath }) => {
  28  |     await page.goto(`${origin}${loginPath}`);
  29  |     await page.getByLabel("Email").fill(email);
  30  |     await page.locator('input[type="password"]').fill(config.password);
  31  |     await page.getByRole("button", { name: "Sign in", exact: true }).click();
> 32  |     await expect(page).toHaveURL(new RegExp(`${expectedPath.replaceAll("/", "\\/")}(?:[?#].*)?$`));
      |                        ^ Error: expect(page).toHaveURL(expected) failed
  33  | };
  34  | 
  35  | const expectNoHorizontalOverflow = async (page) => {
  36  |     expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  37  | };
  38  | 
  39  | test.describe("production public surfaces", () => {
  40  |     test("landing, Practice, and Hiring surfaces are independently reachable", async ({ page }) => {
  41  |         const surfaces = [
  42  |             [config.landingOrigin, /Prepare better|Evalcue AI/i],
  43  |             [`${config.practiceOrigin}/practice`, /Practice for the interview/i],
  44  |             [`${config.hiringOrigin}/hire`, /Hire with clearer evidence|Technical hiring/i],
  45  |         ];
  46  | 
  47  |         for (const [url, heading] of surfaces) {
  48  |             await page.goto(url);
  49  |             await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
  50  |             await expectNoHorizontalOverflow(page);
  51  |         }
  52  |     });
  53  | 
  54  |     test("legal, documentation, and SEO entry points render", async ({ page }) => {
  55  |         const pages = [
  56  |             [`${config.landingOrigin}/docs`, /documentation|Evalcue/i],
  57  |             [`${config.landingOrigin}/privacy`, /Privacy/i],
  58  |             [`${config.landingOrigin}/terms`, /Terms/i],
  59  |             [`${config.practiceOrigin}/practice/resources/system-design-interview-questions`, /System Design Interview Questions/i],
  60  |             [`${config.hiringOrigin}/hire/resources/technical-assessment-template`, /Technical Assessment Template/i],
  61  |         ];
  62  | 
  63  |         for (const [url, heading] of pages) {
  64  |             await page.goto(url);
  65  |             await expect(page.getByRole("heading", { level: 1 }).or(page.getByRole("heading", { level: 2 })).first()).toContainText(heading);
  66  |             await expectNoHorizontalOverflow(page);
  67  |         }
  68  |     });
  69  | 
  70  |     test("API liveness and required dependencies are healthy", async ({ request }) => {
  71  |         const liveness = await request.get(`${config.apiOrigin}/health/liveness`);
  72  |         expect(liveness.status()).toBe(200);
  73  |         expect(await liveness.json()).toMatchObject({ status: "ok" });
  74  | 
  75  |         const readiness = await request.get(`${config.apiOrigin}/health/readiness`);
  76  |         expect(readiness.status()).toBe(200);
  77  |         expect(await readiness.json()).toMatchObject({
  78  |             status: "ok",
  79  |             components: { mongo: "up", redis: "up" },
  80  |         });
  81  |     });
  82  | });
  83  | 
  84  | test.describe("production authenticated Practice", () => {
  85  |     test.beforeEach(() => assertCredentials());
  86  | 
  87  |     test("candidate can sign in, reload, and open core Practice screens", async ({ page }) => {
  88  |         await login({ page, origin: config.practiceOrigin, email: config.candidateEmail, loginPath: "/practice/login", expectedPath: "/practice/dashboard" });
  89  |         await page.reload();
  90  |         await expect(page).toHaveURL(/\/practice\/dashboard$/);
  91  | 
  92  |         const screens = [
  93  |             ["/practice/profile", /Profile & settings/i],
  94  |             ["/practice/progress", /progress/i],
  95  |             ["/practice/resumes", /Resumes/i],
  96  |             ["/practice/resume-review", /resume review/i],
  97  |             ["/practice/company-insights", /Company interview insights/i],
  98  |         ];
  99  | 
  100 |         for (const [path, heading] of screens) {
  101 |             await page.goto(`${config.practiceOrigin}${path}`);
  102 |             await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
  103 |             await expectNoHorizontalOverflow(page);
  104 |         }
  105 |     });
  106 | });
  107 | 
  108 | test.describe("production authenticated Hiring", () => {
  109 |     test.beforeEach(() => assertCredentials());
  110 | 
  111 |     test("owner can sign in and access assessments, candidates, and team management", async ({ page }) => {
  112 |         await login({ page, origin: config.hiringOrigin, email: config.ownerEmail, loginPath: "/hire/login", expectedPath: "/hire/assessments" });
  113 |         await expect(page.getByRole("heading", { name: /Overview|Hiring workspace/i })).toBeVisible();
  114 | 
  115 |         await page.goto(`${config.hiringOrigin}/hire/assessments#candidate-pipeline`);
  116 |         await expect(page.getByRole("heading", { name: "Candidate pipeline" })).toBeVisible();
  117 | 
  118 |         await page.goto(`${config.hiringOrigin}/hire/team`);
  119 |         await expect(page.getByRole("heading", { name: /Organization settings|Team/i })).toBeVisible();
  120 |         await expectNoHorizontalOverflow(page);
  121 |     });
  122 | 
  123 |     test("reviewer has read-only Hiring access", async ({ page }) => {
  124 |         test.skip(!config.reviewerEmail, "Set E2E_HIRING_REVIEWER_EMAIL to test reviewer permissions");
  125 |         await login({ page, origin: config.hiringOrigin, email: config.reviewerEmail, loginPath: "/hire/login", expectedPath: "/hire/assessments" });
  126 |         await expect(page.getByRole("button", { name: "New assessment" })).toHaveCount(0);
  127 |         await page.goto(`${config.hiringOrigin}/hire/team`);
  128 |         await expect(page).toHaveURL(/\/hire\/assessments#candidate-pipeline$/);
  129 |     });
  130 | 
  131 |     test("platform admin can reach administration screens", async ({ page }) => {
  132 |         test.skip(!config.adminEmail, "Set E2E_ADMIN_EMAIL to test platform administration");
```