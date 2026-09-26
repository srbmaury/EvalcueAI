import { expect, test } from "./fixtures.js";

const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const mockSignedOut = async (page) => {
    await page.route("**/api/auth/refresh", (route) => json(route, { message: "Unauthenticated" }, 401));
    page.on("dialog", (dialog) => dialog.accept());
};

const mockSignedIn = async (page, organizationRole = "owner") => {
    await page.route("**/api/auth/refresh", (route) => json(route, { token: "test-access-token" }));
    await page.route("**/api/auth/profile", (route) => json(route, { _id: "user-1", name: "Recruiter One", email: "recruiter@example.com", role: "user", practicePlan: "free" }));
    await page.route("**/api/organizations", (route) => json(route, { organizations: [{ _id: "org-1", name: "Acme Hiring", role: organizationRole, memberCount: 2 }] }));
};

const question = { _id: "question-1", text: "Tell me about a production incident you handled.", answer: "", followUpNumber: 0, followUps: [] };
const round = { _id: "round-1", name: "Technical judgment", deliveryMode: "conversational", adaptive: true, maxQuestions: 3, adaptiveComplete: false, questions: [question] };

const mockPublicAssessment = async (page, shareToken, { askCandidateIntro }) => {
    await page.route(`**/api/assessments/public/${shareToken}`, (route) => json(route, {
        title: "Backend interview",
        jobRole: "Backend Engineer",
        durationMinutes: 30,
        followUpsEnabled: true,
        askCandidateIntro,
        rounds: [{ name: round.name, deliveryMode: round.deliveryMode, questionCount: 3 }],
    }));
    await page.route(`**/api/assessments/public/${shareToken}/start`, (route) => json(route, {
        attemptToken: "attempt-secret",
        attempt: { _id: "attempt-1", status: "started", startedAt: new Date().toISOString(), candidateIntroAt: null, rounds: [round] },
    }, 201));
};

const startAssessment = async (page, shareToken) => {
    await page.goto(`/assessment/${shareToken}`);
    await page.getByLabel("Full name").fill("Intro Candidate");
    await page.getByLabel("Email address").fill("intro@example.com");
    await page.getByRole("checkbox").first().check();
    await page.getByRole("button", { name: "Start assessment" }).click();
};

test("candidate gives an unscored intro before round 1 and it is not shown again", async ({ page }) => {
    await mockSignedOut(page);
    const shareToken = "share-intro-enabled";
    await mockPublicAssessment(page, shareToken, { askCandidateIntro: true });
    let introBody;
    await page.route(`**/api/assessments/public/${shareToken}/attempts/attempt-1/intro`, async (route) => {
        expect(route.request().headers()["x-attempt-token"]).toBe("attempt-secret");
        introBody = await route.request().postDataJSON();
        return json(route, { candidateIntroAt: new Date().toISOString() });
    });

    await startAssessment(page, shareToken);
    await expect(page.getByRole("heading", { name: "Give me a quick introduction" })).toBeVisible();
    await expect(page.getByRole("heading", { name: question.text })).toHaveCount(0);

    await page.getByLabel("Your introduction").fill("I'm a backend engineer; I built a shipment-tracking service in Go with Kafka and Redis.");
    await page.getByRole("button", { name: "Continue to first question" }).click();

    await expect.poll(() => introBody).toEqual({ answer: "I'm a backend engineer; I built a shipment-tracking service in Go with Kafka and Redis." });
    await expect(page.getByRole("heading", { name: question.text })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Give me a quick introduction" })).toHaveCount(0);
});

test("candidate can skip the intro", async ({ page }) => {
    await mockSignedOut(page);
    const shareToken = "share-intro-skip";
    await mockPublicAssessment(page, shareToken, { askCandidateIntro: true });
    let introBody;
    await page.route(`**/api/assessments/public/${shareToken}/attempts/attempt-1/intro`, async (route) => {
        introBody = await route.request().postDataJSON();
        return json(route, { candidateIntroAt: new Date().toISOString() });
    });

    await startAssessment(page, shareToken);
    await page.getByRole("button", { name: "Skip intro" }).click();
    await expect.poll(() => introBody).toEqual({ skip: true });
    await expect(page.getByRole("heading", { name: question.text })).toBeVisible();
});

test("no intro is shown when the hiring team turned it off", async ({ page }) => {
    await mockSignedOut(page);
    const shareToken = "share-intro-disabled";
    await mockPublicAssessment(page, shareToken, { askCandidateIntro: false });

    await startAssessment(page, shareToken);
    await expect(page.getByRole("heading", { name: question.text })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Give me a quick introduction" })).toHaveCount(0);
});

test("recruiter ends an abandoned attempt to free its interview slot", async ({ page }) => {
    await mockSignedIn(page);
    let ended = false;
    const attempt = (status) => ({
        _id: "attempt-abandoned",
        candidateName: "Abandoned Candidate",
        candidateEmail: "abandoned@example.com",
        status,
        startedAt: "2026-09-01T10:00:00Z",
        candidateIntro: "Backend engineer focused on payments.",
        rounds: [{ _id: "round-a", name: "Technical", questions: [] }],
    });
    await page.route("**/api/assessments/report-capacity", (route) => json(route, {
        assessment: { _id: "report-capacity", title: "Capacity screen", status: "active", jobRole: "Backend Engineer", shareToken: "share-capacity", invitations: [], rubric: [] },
        attempts: [attempt(ended ? "revoked" : "started")],
    }));
    await page.route("**/api/assessments/report-capacity/attempts/attempt-abandoned/end", (route) => {
        ended = true;
        return json(route, { attempt: { _id: "attempt-abandoned", status: "revoked" }, released: true });
    });

    await page.goto("/hire/assessments/report-capacity");
    await expect(page.getByText("Backend engineer focused on payments.")).toBeVisible();
    await page.getByRole("button", { name: "End attempt" }).click();
    await expect(page.getByRole("dialog", { name: "End this attempt?" })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "End attempt" }).click();

    await expect.poll(() => ended).toBe(true);
    await expect(page.getByText("Ended", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "End attempt" })).toHaveCount(0);
});
