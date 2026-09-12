import { expect, test } from "@playwright/test";

const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const user = { _id: "recruiter-1", name: "Recruiter One", email: "recruiter@example.com", role: "user", practicePlan: "free" };
const baseAssessment = (overrides = {}) => ({
    _id: "a1",
    title: "Backend screen",
    status: "active",
    jobRole: "Backend Engineer",
    jobDescription: "Build reliable backend systems and explain production engineering trade-offs clearly.",
    shareToken: "share-a1",
    durationMinutes: 30,
    timezone: "Asia/Kolkata",
    followUpsEnabled: true,
    inviteOnly: false,
    invitations: [],
    rubric: [],
    integrity: { enabled: false, requireFullscreen: false, requireCamera: false, trackFocus: true, trackClipboard: true, retentionDays: 30 },
    rounds: [{ _id: "r1", name: "Interview", description: "Backend judgment", deliveryMode: "conversational", adaptive: false, questionCount: 1, questions: [{ _id: "q1", text: "Describe a reliability trade-off.", required: true }] }],
    updatedAt: "2026-09-12T10:00:00.000Z",
    ...overrides,
});

const mockSignedIn = async (page) => {
    await page.route("**/api/auth/refresh", (route) => json(route, { token: "access-token" }));
    await page.route("**/api/auth/profile", (route) => json(route, user));
    await page.route("**/api/auth/reminders/deliveries", (route) => json(route, { items: [] }));
    await page.route("**/api/organizations", (route) => json(route, { organizations: [{ _id: "org-1", name: "Acme Hiring", role: "owner", memberCount: 2 }] }));
    await page.route("**/api/billing/hiring/entitlements", (route) => json(route, {
        product: "hiring", organization: { _id: "org-1", name: "Acme Hiring" }, plan: "trial", subscriptionStatus: "inactive",
        limits: { candidateInterviews: 5 }, used: { candidateInterviews: 0 }, planLimits: {}, prices: {}, billingAvailable: {}, canManageBilling: true,
    }));
};

const mockReport = async (page, getAssessment = () => baseAssessment()) => {
    await page.route("**/api/assessments/a1", (route) => {
        if (route.request().method() !== "GET") return route.continue();
        return json(route, { assessment: getAssessment(), attempts: [] });
    });
};

test("empty Invite Candidates submission warns, focuses the field, and sends no request", async ({ page }) => {
    await mockSignedIn(page);
    await mockReport(page);
    let invitePosts = 0;
    await page.route("**/api/assessments/a1/invitations", (route) => { invitePosts += 1; return json(route, { results: [] }); });

    await page.goto("/hire/assessments/a1");
    await page.getByRole("button", { name: "Send invitations" }).click();

    await expect(page.getByText("Enter at least one candidate email.", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Candidate emails")).toBeFocused();
    expect(invitePosts).toBe(0);
});

test("invitation delivery shows sent, queued, and failed results and deduplicates emails", async ({ page }) => {
    await mockSignedIn(page);
    await mockReport(page);
    let requestBody;
    await page.route("**/api/assessments/a1/invitations", async (route) => {
        requestBody = await route.request().postDataJSON();
        return json(route, { results: [{ email: "one@example.com", sent: true }, { email: "two@example.com", queued: true }, { email: "three@example.com", sent: false, queued: false }] });
    });

    await page.goto("/hire/assessments/a1");
    await page.getByLabel("Candidate emails").fill("ONE@example.com, two@example.com\none@example.com; three@example.com");
    await page.getByRole("button", { name: "Send invitations" }).click();

    await expect.poll(() => requestBody?.candidates?.map((item) => item.email)).toEqual(["one@example.com", "two@example.com", "three@example.com"]);
    await expect(page.getByText("Invitations: 1 sent · 1 queued · 1 failed.", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Candidate emails")).toHaveValue("");
});

test("Invite candidates CTA scrolls to and focuses the invitation field", async ({ page }) => {
    await mockSignedIn(page);
    await mockReport(page, () => baseAssessment({ inviteOnly: true }));

    await page.goto("/hire/assessments/a1");
    await page.getByRole("button", { name: "Invite candidates", exact: true }).click();
    await expect(page.getByLabel("Candidate emails")).toBeFocused({ timeout: 1500 });
});

test("candidate preview never exposes a Publish Assessment control", async ({ page }) => {
    await mockSignedIn(page);
    await page.route("**/api/assessments/a1/preview", (route) => json(route, {
        title: "Backend screen", company: "Acme Hiring", jobRole: "Backend Engineer", durationMinutes: 30,
        inviteOnly: true, followUpsEnabled: true, candidateInstructions: "Use a quiet room.",
        integrity: { enabled: true, requireCamera: true, requireFullscreen: true },
        rounds: [{ name: "Interview", deliveryMode: "conversational", questions: [{ text: "Design an API." }, { text: "Secure the API." }] }],
    }));

    await page.goto("/hire/assessments/a1/preview");
    await expect(page.getByRole("heading", { name: "Backend screen" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Design an API." })).toBeVisible();
    await expect(page.getByRole("button", { name: /publish assessment/i })).toHaveCount(0);
    await page.getByRole("button", { name: "Next question" }).click();
    await expect(page.getByRole("heading", { name: "Secure the API." })).toBeVisible();
});

test("draft report actions stay compact instead of stretching across a mobile viewport", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Mobile layout regression");
    await mockSignedIn(page);
    await mockReport(page, () => baseAssessment({ status: "draft" }));

    await page.goto("/hire/assessments/a1");
    const viewport = page.viewportSize();
    for (const name of ["Preview candidate experience", "Edit draft", "Publish assessment"]) {
        const button = page.getByRole("link", { name }).or(page.getByRole("button", { name })).first();
        await expect(button).toBeVisible();
        const box = await button.boundingBox();
        expect(box.width).toBeLessThan((viewport?.width || 412) - 48);
    }
});

test("editing an existing draft publishes with content PATCH followed by one status transition", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Builder regression runs once");
    await mockSignedIn(page);
    let current = baseAssessment({ status: "draft", opensAt: null, expiresAt: null });
    const patches = [];
    await page.route("**/api/assessments/a1", async (route) => {
        if (route.request().method() === "GET") return json(route, { assessment: current, attempts: [] });
        if (route.request().method() === "PATCH") {
            const body = await route.request().postDataJSON();
            patches.push(body);
            current = { ...current, ...body };
            return json(route, current);
        }
        return route.continue();
    });

    await page.goto("/hire/assessments?create=1&edit=a1");
    await expect(page.getByRole("heading", { name: "Edit assessment draft" })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Publish assessment" }).click();

    await expect.poll(() => patches.length).toBe(2);
    expect(patches[0].status).toBeUndefined();
    expect(patches[1]).toEqual({ status: "active" });
    await expect(page).toHaveURL(/\/hire\/assessments\/a1$/);
});

test("editing a draft preserves its assessment timezone and wall-clock schedule", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Builder regression runs once");
    await mockSignedIn(page);
    let savedPayload;
    const assessment = baseAssessment({
        status: "draft",
        opensAt: "2026-10-01T03:30:00.000Z",
        expiresAt: "2026-10-01T05:30:00.000Z",
        timezone: "Asia/Kolkata",
    });
    await page.route("**/api/assessments/a1", async (route) => {
        if (route.request().method() === "GET") return json(route, { assessment, attempts: [] });
        if (route.request().method() === "PATCH") { savedPayload = await route.request().postDataJSON(); return json(route, { ...assessment, ...savedPayload }); }
        return route.continue();
    });

    await page.goto("/hire/assessments?create=1&edit=a1");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Show scheduling and integrity settings" }).click();

    await expect(page.getByLabel("Opens at (Asia/Kolkata)")).toHaveValue("2026-10-01T09:00");
    await expect(page.getByLabel("Submission deadline (Asia/Kolkata)")).toHaveValue("2026-10-01T11:00");
    await page.getByRole("button", { name: "Save draft changes" }).click();
    await expect.poll(() => savedPayload?.timezone).toBe("Asia/Kolkata");
    expect(savedPayload.opensAt).toBe("2026-10-01T03:30:00.000Z");
    expect(savedPayload.expiresAt).toBe("2026-10-01T05:30:00.000Z");
});

test("scheduled report displays the opening time in the assessment timezone", async ({ page }) => {
    await mockSignedIn(page);
    await mockReport(page, () => baseAssessment({ status: "scheduled", opensAt: "2026-10-01T03:30:00.000Z", timezone: "Asia/Kolkata" }));

    await page.goto("/hire/assessments/a1");
    await expect(page.getByText(/Scheduled to open Oct 1, 2026, 9:00 AM \(Asia\/Kolkata\)\./)).toBeVisible();
});

test("creating a new version redirects to the new canonical Hire assessment and shows confirmation", async ({ page }) => {
    await mockSignedIn(page);
    await mockReport(page);
    await page.route("**/api/assessments/a1/duplicate", (route) => json(route, { ...baseAssessment({ _id: "a2", title: "Backend screen · v2", status: "draft" }) }));
    await page.route("**/api/assessments/a2", (route) => json(route, { assessment: baseAssessment({ _id: "a2", title: "Backend screen · v2", status: "draft" }), attempts: [] }));

    await page.goto("/hire/assessments/a1");
    await page.getByRole("button", { name: "Create new version" }).click();
    await expect(page).toHaveURL(/\/hire\/assessments\/a2$/);
    await expect(page.getByText("New version “Backend screen · v2” created successfully.", { exact: true })).toBeVisible();
});

test("very long assessment titles do not create page-level horizontal overflow", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Mobile overflow regression");
    await mockSignedIn(page);
    await mockReport(page, () => baseAssessment({ title: "Principal-Distributed-Systems-Platform-Engineering-Assessment-With-An-Extremely-Long-Unbroken-Name" }));

    await page.goto("/hire/assessments/a1");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
});
