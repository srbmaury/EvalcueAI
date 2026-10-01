import { expect, test } from "./fixtures.js";

const json = (route, body, status = 200) => route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
});

const recruiter = {
    _id: "recruiter-critical",
    name: "Recruiter Critical",
    email: "recruiter@example.com",
    role: "user",
    practicePlan: "free",
};

const publicAssessment = (overrides = {}) => ({
    title: "Backend reliability screen",
    organizationName: "Acme Hiring",
    jobRole: "Backend Engineer",
    durationMinutes: 30,
    timezone: "UTC",
    capabilities: { transcription: false, codeExecution: false },
    integrity: { enabled: false, requireCamera: false, requireFullscreen: false },
    rounds: [{ name: "Interview", deliveryMode: "conversational", adaptive: false, questionCount: 1 }],
    ...overrides,
});

const attemptPayload = ({ question = "Explain a reliability incident.", answer = "", id = "attempt-critical" } = {}) => ({
    attemptToken: "attempt-secret",
    attempt: {
        _id: id,
        startedAt: new Date().toISOString(),
        rounds: [{
            _id: "round-critical",
            name: "Interview",
            deliveryMode: "conversational",
            questions: [{ _id: "question-critical", text: question, answer, followUps: [] }],
        }],
    },
});

const mockSignedOut = async (page) => {
    await page.route("**/api/auth/refresh", (route) => json(route, { message: "Unauthenticated" }, 401));
    // Accept any unexpected native dialog so it cannot silently change test behaviour
    // (Playwright dismisses dialogs by default).
    page.on("dialog", (dialog) => dialog.accept());
};

const fillCandidateSetup = async (page, { name = "Candidate One", email = "candidate@example.com" } = {}) => {
    await page.getByLabel("Full name").fill(name);
    await page.getByLabel("Email address").fill(email);
    await page.getByRole("checkbox").first().check();
};

const hiringEntitlements = (overrides = {}) => ({
    product: "hiring",
    organization: { _id: "org-1", name: "Acme Hiring" },
    plan: "trial",
    subscriptionStatus: "inactive",
    period: "lifetime",
    periodType: "lifetime",
    limits: { candidateInterviews: 5 },
    used: { candidateInterviews: 0 },
    planLimits: {
        trial: { candidateInterviews: 5 },
        starter: { candidateInterviews: 25 },
        growth: { candidateInterviews: 100 },
        enterprise: { candidateInterviews: 100000 },
    },
    prices: {},
    billingAvailable: { starter: true, growth: true },
    canManageBilling: true,
    hasBillingAccount: false,
    requiresBillingPortal: false,
    ...overrides,
});

const mockHiringSession = async (page, { role = "owner", entitlements = hiringEntitlements() } = {}) => {
    await page.route("**/api/auth/refresh", (route) => json(route, { token: "access-token" }));
    await page.route("**/api/auth/profile", (route) => json(route, recruiter));
    await page.route("**/api/auth/reminders/deliveries", (route) => json(route, { items: [] }));
    await page.route("**/api/organizations", (route) => json(route, {
        organizations: [{ _id: "org-1", name: "Acme Hiring", role, memberCount: 1 }],
    }));
    await page.route("**/api/organizations/org-1/members", (route) => json(route, { members: [] }));
    await page.route("**/api/billing/hiring/entitlements", (route) => json(route, entitlements));
};

const reportAssessment = (overrides = {}) => ({
    _id: "a-critical",
    title: "Backend screen",
    status: "draft",
    jobRole: "Backend Engineer",
    jobDescription: "Backend role",
    shareToken: "share-critical",
    durationMinutes: 30,
    timezone: "UTC",
    followUpsEnabled: true,
    inviteOnly: true,
    invitations: [],
    rubric: [],
    integrity: { enabled: false },
    rounds: [{ _id: "r1", name: "Interview", deliveryMode: "conversational", questions: [{ _id: "q1", text: "Design an API." }] }],
    ...overrides,
});

test("closed or expired candidate links fail safely without exposing a start action", async ({ page }) => {
    await mockSignedOut(page);
    await page.route("**/api/assessments/public/share-closed", (route) => json(route, { message: "Assessment expired" }, 410));

    await page.goto("/assessment/share-closed");

    await expect(page.getByText("This assessment link is invalid, closed, or expired.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start assessment" })).toHaveCount(0);
});

test("candidate can retry after a transient start failure without re-entering identity", async ({ page }) => {
    await mockSignedOut(page);
    const token = "share-start-retry";
    let startCalls = 0;
    await page.route(`**/api/assessments/public/${token}`, (route) => json(route, publicAssessment()));
    await page.route(`**/api/assessments/public/${token}/start`, (route) => {
        startCalls += 1;
        if (startCalls === 1) return json(route, { message: "Candidate capacity temporarily unavailable" }, 503);
        return json(route, attemptPayload(), 201);
    });

    await page.goto(`/assessment/${token}`);
    await fillCandidateSetup(page);
    await page.getByRole("button", { name: "Start assessment" }).click();

    await expect(page.getByText("Candidate capacity temporarily unavailable", { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel("Full name")).toHaveValue("Candidate One");
    await expect(page.getByLabel("Email address")).toHaveValue("candidate@example.com");
    await expect(page.getByRole("button", { name: "Start assessment" })).toBeEnabled();

    await page.getByRole("button", { name: "Start assessment" }).click();
    await expect(page.getByRole("heading", { name: "Explain a reliability incident." })).toBeVisible();
    expect(startCalls).toBe(2);
});

test("candidate start control is disabled while the start request is in flight", async ({ page }) => {
    await mockSignedOut(page);
    const token = "share-start-pending";
    let releaseStart;
    const pendingStart = new Promise((resolve) => { releaseStart = resolve; });
    let startCalls = 0;
    await page.route(`**/api/assessments/public/${token}`, (route) => json(route, publicAssessment()));
    await page.route(`**/api/assessments/public/${token}/start`, async (route) => {
        startCalls += 1;
        await pendingStart;
        return json(route, attemptPayload(), 201);
    });

    await page.goto(`/assessment/${token}`);
    await fillCandidateSetup(page);
    const startButton = page.locator('form button[type="submit"]');
    await startButton.click();

    try {
        await expect(startButton).toBeDisabled();
        expect(startCalls).toBe(1);
    } finally {
        releaseStart();
    }
    await expect(page.getByRole("heading", { name: "Explain a reliability incident." })).toBeVisible();
});

test("personal invitation pre-fills and locks the invited candidate email", async ({ page }) => {
    await mockSignedOut(page);
    const token = "share-invited";
    const invitationId = "invite-1";
    await page.route(new RegExp(`/api/assessments/public/${token}(?:\\?.*)?$`), (route) => json(route, publicAssessment({ inviteOnly: true })));
    await page.route(`**/api/assessments/public/${token}/invitation/${invitationId}`, (route) => json(route, {
        name: "Invited Candidate",
        email: "invited@example.com",
        emailLocked: true,
    }));

    await page.goto(`/assessment/${token}?invite=${invitationId}`);

    await expect(page.getByLabel("Full name")).toHaveValue("Invited Candidate");
    await expect(page.getByLabel("Email address")).toHaveValue("invited@example.com");
    await expect(page.getByLabel("Email address")).toBeDisabled();
    await expect(page.getByText("Prefilled from your invitation", { exact: true })).toBeVisible();
});

test("saved candidate attempt resumes without creating a second attempt", async ({ page }) => {
    await mockSignedOut(page);
    const token = "share-restore-attempt";
    const saved = attemptPayload({ question: "Resume this reliability question." });
    const storageKey = `assessment-attempt:${token}:open`;
    await page.addInitScript(({ key, value }) => {
        window.sessionStorage.setItem(key, JSON.stringify(value));
    }, {
        key: storageKey,
        value: {
            attempt: saved.attempt,
            attemptToken: saved.attemptToken,
            dirty: {},
            identity: { name: "Candidate One", email: "candidate@example.com" },
            invitationId: "",
            savedAt: new Date().toISOString(),
            navigation: { activeRoundIndex: 0, activeQuestionIndex: 0, roundTransition: null },
        },
    });
    let startCalls = 0;
    await page.route(`**/api/assessments/public/${token}`, (route) => json(route, publicAssessment()));
    await page.route(`**/api/assessments/public/${token}/start`, (route) => { startCalls += 1; return json(route, saved, 201); });

    await page.goto(`/assessment/${token}`);

    await expect(page.getByText(/We found a saved attempt on this device/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Resume this reliability question." })).toBeVisible();
    expect(startCalls).toBe(0);
});

test("candidate submission failure is retryable without losing the completed attempt", async ({ page }) => {
    await mockSignedOut(page);
    const token = "share-submit-retry";
    const started = attemptPayload({ question: "Completed question", answer: "A saved answer." });
    let submitCalls = 0;
    await page.route(`**/api/assessments/public/${token}`, (route) => json(route, publicAssessment()));
    await page.route(`**/api/assessments/public/${token}/start`, (route) => json(route, started, 201));
    await page.route(`**/api/assessments/public/${token}/attempts/${started.attempt._id}/submit`, (route) => {
        submitCalls += 1;
        if (submitCalls === 1) return json(route, { message: "Submission service temporarily unavailable" }, 503);
        return json(route, { accepted: true }, 202);
    });

    await page.goto(`/assessment/${token}`);
    await fillCandidateSetup(page);
    await page.getByRole("button", { name: "Start assessment" }).click();
    await expect(page.getByRole("button", { name: "Review and submit" })).toBeVisible();

    await page.getByRole("button", { name: "Review and submit" }).click();
    await page.getByRole("button", { name: "Submit assessment" }).click();
    await expect(page.getByText("Submission service temporarily unavailable", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Review and submit" })).toBeEnabled();

    await page.getByRole("button", { name: "Review and submit" }).click();
    await page.getByRole("button", { name: "Submit assessment" }).click();
    await expect(page.getByRole("heading", { name: "Assessment submitted" })).toBeVisible();
    expect(submitCalls).toBe(2);
});

test("TTS engine failure never blocks a candidate from typing an answer", { tag: "@desktop-only" }, async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(window, "speechSynthesis", {
            configurable: true,
            value: {
                speaking: false,
                cancel() {},
                getVoices() { return []; },
                speak() { throw new Error("Synthetic TTS failure"); },
            },
        });
        Object.defineProperty(window, "SpeechSynthesisUtterance", {
            configurable: true,
            value: class { constructor(text) { this.text = text; } },
        });
    });
    await mockSignedOut(page);
    const token = "share-tts-failure";
    await page.route(`**/api/assessments/public/${token}`, (route) => json(route, publicAssessment()));
    await page.route(`**/api/assessments/public/${token}/start`, (route) => json(route, attemptPayload({ question: "Explain your recovery strategy." }), 201));

    await page.goto(`/assessment/${token}`);
    await fillCandidateSetup(page);
    await page.getByRole("button", { name: "Start assessment" }).click();
    await expect(page.getByRole("heading", { name: "Explain your recovery strategy." })).toBeVisible();

    await page.getByRole("button", { name: "Type / code" }).click();
    const answer = page.getByPlaceholder("Answer by typing or speaking...");
    await answer.fill("I would fail over safely and verify recovery before restoring traffic.");
    await expect(answer).toHaveValue("I would fail over safely and verify recovery before restoring traffic.");
});

test("draft assessment invitations are queued with normalized candidate identity", async ({ page }) => {
    await mockHiringSession(page);
    const assessment = reportAssessment({ status: "draft" });
    let requestBody;
    await page.route("**/api/assessments/a-critical", (route) => json(route, { assessment, attempts: [] }));
    await page.route("**/api/assessments/a-critical/invitations", async (route) => {
        requestBody = await route.request().postDataJSON();
        return json(route, { results: [{ email: "candidate@example.com", queued: true, sent: false }] });
    });

    await page.goto("/hire/assessments/a-critical");
    await page.getByLabel("Candidate emails").fill("Candidate@Example.com");
    await page.getByRole("button", { name: "Queue invitations" }).click();

    await expect.poll(() => requestBody?.candidates).toEqual([{ email: "candidate@example.com" }]);
    await expect(page.getByText("Invitations: 1 queued.", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Candidate emails")).toHaveValue("");
});

test("Hiring billing shows configured quotas and sends the selected plan to checkout", async ({ page }) => {
    await mockHiringSession(page);
    const checkoutBodies = [];
    await page.route("**/api/billing/hiring/checkout-session", async (route) => {
        checkoutBodies.push(await route.request().postDataJSON());
        return json(route, { message: "Checkout service unavailable in test" }, 503);
    });

    await page.goto("/hire/team");
    await expect(page.getByText("25 candidate interviews / month", { exact: true })).toBeVisible();
    await expect(page.getByText("100 candidate interviews / month", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Choose Starter" }).click();
    await page.getByLabel("Billing phone number").fill("9876543210");
    await page.getByRole("button", { name: "Review payment", exact: true }).click();
    await expect(page.getByText("Checkout service unavailable in test", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Choose Starter" })).toBeEnabled();
    await page.getByRole("button", { name: "Choose Growth" }).click();
    await page.getByLabel("Billing phone number").fill("9876543210");
    await page.getByRole("button", { name: "Review payment", exact: true }).click();

    await expect.poll(() => checkoutBodies).toEqual([{ plan: "starter", phone: "9876543210" }, { plan: "growth", phone: "9876543210" }]);
});

test("Hiring billing blocks a second checkout when the existing subscription requires the portal", async ({ page }) => {
    const entitlements = hiringEntitlements({
        plan: "starter",
        subscriptionStatus: "past_due",
        hasBillingAccount: true,
        requiresBillingPortal: true,
        limits: { candidateInterviews: 25 },
    });
    await mockHiringSession(page, { entitlements });
    let checkoutCalls = 0;
    await page.route("**/api/billing/hiring/checkout-session", (route) => { checkoutCalls += 1; return json(route, { url: "/" }); });

    await page.goto("/hire/team");

    await expect(page.getByText(/already has a Hiring subscription that needs attention/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Current plan" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Resolve existing billing" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Manage billing" }).first()).toBeVisible();
    expect(checkoutCalls).toBe(0);
});

test("reviewer role cannot open organization settings or billing controls", async ({ page }) => {
    await mockHiringSession(page, { role: "reviewer" });
    await page.route("**/api/assessments/overview**", (route) => json(route, { summary: {}, assessments: [], candidates: [], totalPages: 1 }));
    await page.route("**/api/assessments?**", (route) => json(route, { items: [], totalPages: 1 }));

    await page.goto("/hire/team");

    await expect(page).toHaveURL(/\/hire\/assessments#candidate-pipeline$/);
    await expect(page.getByRole("heading", { name: "Organization settings" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Plan & billing" })).toHaveCount(0);
});

test("failed Hire login is retryable and still returns to the originally requested screen", async ({ page }) => {
    let authenticated = false;
    let loginCalls = 0;
    await page.route("**/api/auth/refresh", (route) => authenticated
        ? json(route, { token: "restored-token" })
        : json(route, { message: "Unauthenticated" }, 401));
    await page.route("**/api/auth/login", (route) => {
        loginCalls += 1;
        if (loginCalls === 1) return json(route, { message: "Invalid credentials" }, 401);
        authenticated = true;
        return json(route, { token: "access-token" });
    });
    await page.route("**/api/auth/profile", (route) => json(route, recruiter));
    await page.route("**/api/auth/reminders/deliveries", (route) => json(route, { items: [] }));
    await page.route("**/api/organizations", (route) => json(route, { organizations: [{ _id: "org-1", name: "Acme Hiring", role: "owner", memberCount: 1 }] }));
    await page.route("**/api/organizations/org-1/members", (route) => json(route, { members: [] }));
    await page.route("**/api/billing/hiring/entitlements", (route) => json(route, hiringEntitlements()));

    await page.goto("/hire/team");
    await expect(page).toHaveURL(/\/hire\/login$/);
    await page.getByLabel("Email").fill("recruiter@example.com");
    await page.locator("input#password").fill("StrongPass1!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page.getByText("Invalid credentials", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page).toHaveURL(/\/hire\/team$/);
    await expect(page.getByRole("heading", { name: "Organization settings" })).toBeVisible();
    expect(loginCalls).toBe(2);
});
