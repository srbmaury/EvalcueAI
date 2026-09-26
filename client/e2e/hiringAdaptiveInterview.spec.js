import { expect, test } from "./fixtures.js";

const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const mockSignedOut = async (page) => {
    await page.route("**/api/auth/refresh", (route) => json(route, { message: "Unauthenticated" }, 401));
    // Accept any unexpected native dialog so it cannot silently change test behaviour
    // (Playwright dismisses dialogs by default).
    page.on("dialog", (dialog) => dialog.accept());
};

const mockSignedIn = async (page, organizationRole = "owner") => {
    await page.route("**/api/auth/refresh", (route) => json(route, { token: "test-access-token" }));
    await page.route("**/api/auth/profile", (route) => json(route, {
        _id: "user-1",
        name: "Recruiter One",
        email: "recruiter@example.com",
        role: "user",
        practicePlan: "free",
    }));
    await page.route("**/api/organizations", (route) => json(route, {
        organizations: [{ _id: "org-1", name: "Acme Hiring", role: organizationRole, memberCount: 4 }],
    }));
    await page.route("**/api/billing/hiring/entitlements", (route) => json(route, {
        product: "hiring",
        organization: { _id: "org-1", name: "Acme Hiring" },
        plan: "trial",
        subscriptionStatus: "inactive",
        period: "lifetime",
        periodType: "lifetime",
        limits: { candidateInterviews: 5 },
        used: { candidateInterviews: 1 },
        planLimits: {
            trial: { candidateInterviews: 5 },
            starter: { candidateInterviews: 25 },
            growth: { candidateInterviews: 100 },
            enterprise: { candidateInterviews: 100000 },
        },
        prices: {},
        billingAvailable: {},
        canManageBilling: ["owner", "admin"].includes(organizationRole),
    }));
};

const mockEmptyHiringWorkspace = async (page, onPublish) => {
    await page.route("**/api/assessments/overview**", (route) => json(route, {
        summary: {}, assessments: [], candidates: [], totalPages: 1,
    }));
    await page.route("**/api/assessments?**", (route) => json(route, { items: [], totalPages: 1 }));
    await page.route("**/api/assessments", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        const payload = await route.request().postDataJSON();
        onPublish?.(payload);
        return json(route, { _id: "assessment-created", shareToken: "share-created", ...payload }, 201);
    });
};

const startPublicAssessment = async (page, shareToken, name = "Candidate", email = "candidate@example.com") => {
    await page.goto(`/assessment/${shareToken}`);
    await page.getByLabel("Full name").fill(name);
    await page.getByLabel("Email address").fill(email);
    await page.getByRole("checkbox").first().check();
    await page.getByRole("button", { name: "Start assessment" }).click();
};

const fillRoleStep = async (page, {
    role = "Senior Backend Engineer",
    title = "Backend evidence interview",
    description = "Own reliable backend systems, APIs, incident response, testing, observability, and architecture trade-offs in production.",
} = {}) => {
    await expect(page.getByRole("heading", { name: "Create an assessment", exact: true })).toBeVisible();
    await expect(page.getByText("Step 1 of 4", { exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "Job role" }).fill(role);
    await page.getByLabel("Assessment name").fill(title);
    await page.getByLabel("Job description and success criteria").fill(description);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Step 2 of 4", { exact: true })).toBeVisible();
};

test("recruiter can lock the interview to reviewed primary questions while keeping AI follow-ups enabled", async ({ page }) => {
    await mockSignedIn(page);
    let published;
    await mockEmptyHiringWorkspace(page, (payload) => { published = payload; });

    await page.goto("/hire/assessments?create=1");
    await fillRoleStep(page);

    const adaptiveToggle = page.getByLabel(/^Let AI adapt the remaining primary questions/);
    await expect(adaptiveToggle).toBeChecked();
    await adaptiveToggle.uncheck();
    const questionCount = page.getByLabel("Question count");
    await expect(questionCount).toHaveValue("3");
    await questionCount.fill("1");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText("Step 3 of 4", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Add question" }).click();
    await page.getByRole("textbox", { name: "Question 1", exact: true }).fill("Describe a production reliability decision you made and the trade-off you accepted.");
    await expect(page.getByLabel("Must ask")).toBeChecked();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText("Step 4 of 4", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Allow contextual AI follow-up questions")).toBeChecked();
    await page.getByRole("button", { name: "Publish assessment" }).click();

    await expect.poll(() => published).toBeTruthy();
    expect(published.status).toBe("active");
    expect(published.followUpsEnabled).toBe(true);
    expect(published.rounds).toHaveLength(1);
    expect(published.rounds[0].adaptive).toBe(false);
    expect(published.rounds[0].questionCount).toBe(1);
    expect(published.rounds[0].questions).toEqual([
        expect.objectContaining({
            text: "Describe a production reliability decision you made and the trade-off you accepted.",
            required: true,
        }),
    ]);
});

test("recruiter can explicitly mark a reviewed adaptive question as optional", async ({ page }) => {
    await mockSignedIn(page);
    let published;
    await mockEmptyHiringWorkspace(page, (payload) => { published = payload; });

    await page.goto("/hire/assessments?create=1");
    await fillRoleStep(page, {
        role: "Backend Engineer",
        title: "Adaptive backend interview",
        description: "Evaluate practical backend engineering judgment, reliability, API design, testing, and clear communication in production scenarios.",
    });

    const adaptiveToggle = page.getByLabel(/^Let AI adapt the remaining primary questions/);
    await expect(adaptiveToggle).toBeChecked();
    await expect(page.getByLabel("Maximum primary questions")).toHaveValue("3");
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByRole("button", { name: "Add question" }).click();
    await page.getByRole("textbox", { name: "Question 1", exact: true }).fill("Tell me about a reliability incident you personally owned.");
    const mustAsk = page.getByLabel("Must ask");
    await expect(mustAsk).toBeChecked();
    await mustAsk.uncheck();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Publish assessment" }).click();

    await expect.poll(() => published).toBeTruthy();
    expect(published.rounds).toHaveLength(1);
    expect(published.rounds[0].adaptive).toBe(true);
    expect(published.rounds[0].questionCount).toBe(3);
    expect(published.rounds[0].questions).toEqual([
        expect.objectContaining({
            text: "Tell me about a reliability incident you personally owned.",
            required: false,
        }),
    ]);
});

test("adaptive conversational interview uses stable progress while advancing into a server-generated primary question", async ({ page }) => {
    await mockSignedOut(page);
    const shareToken = "share-adaptive-primary";
    const firstQuestion = { _id: "question-1", text: "Tell me about a difficult production incident.", answer: "", followUpNumber: 0, followUps: [] };
    const secondQuestion = { _id: "question-2", text: "How would you reduce blast radius in the next release?", answer: "", followUpNumber: 0, followUps: [] };
    const round = { _id: "round-1", name: "Technical judgment", deliveryMode: "conversational", adaptive: true, maxQuestions: 3, adaptiveComplete: false, questions: [firstQuestion] };

    await page.route(`**/api/assessments/public/${shareToken}`, (route) => json(route, {
        title: "Adaptive backend interview",
        jobRole: "Backend Engineer",
        durationMinutes: 30,
        followUpsEnabled: false,
        rounds: [{ name: round.name, deliveryMode: round.deliveryMode, adaptive: true, questionCount: 3 }],
    }));
    await page.route(`**/api/assessments/public/${shareToken}/start`, (route) => json(route, {
        attemptToken: "attempt-secret",
        attempt: { _id: "attempt-1", startedAt: new Date().toISOString(), rounds: [round] },
    }, 201));
    await page.route(`**/api/assessments/public/${shareToken}/attempts/attempt-1/answer`, async (route) => {
        const body = await route.request().postDataJSON();
        expect(route.request().headers()["x-attempt-token"]).toBe("attempt-secret");
        return json(route, {
            attempt: {
                _id: "attempt-1",
                rounds: [{ ...round, questions: [{ ...firstQuestion, answer: body.answer }, secondQuestion] }],
            },
        });
    });

    await startPublicAssessment(page, shareToken, "Adaptive Candidate", "adaptive@example.com");
    await expect(page.getByRole("heading", { name: firstQuestion.text })).toBeVisible();
    await expect(page.getByText(/remaining/)).toBeVisible();
    await expect(page.getByText("Adaptive primary questions", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Type / code" }).click();
    await page.getByPlaceholder("Answer by typing or speaking...").fill("I stabilized traffic, narrowed the failure domain, rolled back safely, and added release health gates.");
    await page.getByRole("button", { name: "I’m done" }).click();

    await expect(page.getByRole("heading", { name: secondQuestion.text })).toBeVisible();
    await expect(page.getByText("Adaptive primary questions", { exact: true })).toHaveCount(0);
    await expect(page.getByText("1 of 2 complete", { exact: true })).toHaveCount(0);
});

test("candidate completes all three chained AI follow-ups before a conversational question is marked complete", async ({ page }) => {
    await mockSignedOut(page);
    const shareToken = "share-three-followups";
    const followUpQuestions = [
        "What signal told you the mitigation was working?",
        "How did you prevent the same class of incident from recurring?",
        "What trade-off did your prevention introduce?",
    ];
    const primary = { _id: "question-1", text: "Describe a production incident you owned end to end.", answer: "", followUpNumber: 0, followUpQuestion: "", followUpAnswer: "", followUps: [] };
    const roundBase = { _id: "round-1", name: "Incident response", deliveryMode: "conversational", adaptive: false };
    let currentQuestion = { ...primary };
    let answerRequests = 0;

    await page.route(`**/api/assessments/public/${shareToken}`, (route) => json(route, {
        title: "Incident response interview",
        jobRole: "Senior Engineer",
        durationMinutes: 30,
        followUpsEnabled: true,
        rounds: [{ name: roundBase.name, deliveryMode: "conversational", adaptive: false, questionCount: 1 }],
    }));
    await page.route(`**/api/assessments/public/${shareToken}/start`, (route) => json(route, {
        attemptToken: "followup-secret",
        attempt: { _id: "attempt-followups", startedAt: new Date().toISOString(), rounds: [{ ...roundBase, questions: [currentQuestion] }] },
    }, 201));
    await page.route(`**/api/assessments/public/${shareToken}/attempts/attempt-followups/answer`, async (route) => {
        const body = await route.request().postDataJSON();
        expect(route.request().headers()["x-attempt-token"]).toBe("followup-secret");
        answerRequests += 1;

        if (body.answer) {
            currentQuestion = {
                ...currentQuestion,
                answer: body.answer,
                followUpQuestion: followUpQuestions[0],
                followUpAnswer: "",
                followUpNumber: 1,
            };
        } else {
            const answeredFollowUp = {
                question: currentQuestion.followUpQuestion,
                answer: body.followUpAnswer,
            };
            const followUps = [...(currentQuestion.followUps || []), answeredFollowUp];
            const nextIndex = followUps.length;
            currentQuestion = nextIndex < followUpQuestions.length
                ? {
                    ...currentQuestion,
                    followUps,
                    followUpQuestion: followUpQuestions[nextIndex],
                    followUpAnswer: "",
                    followUpNumber: nextIndex + 1,
                }
                : {
                    ...currentQuestion,
                    followUps,
                    followUpQuestion: "",
                    followUpAnswer: "",
                    followUpNumber: 0,
                };
        }

        return json(route, {
            attempt: { _id: "attempt-followups", startedAt: new Date().toISOString(), rounds: [{ ...roundBase, questions: [currentQuestion] }] },
        });
    });
    await page.route(`**/api/assessments/public/${shareToken}/attempts/attempt-followups/submit`, (route) => json(route, { received: true }));

    await startPublicAssessment(page, shareToken, "Followup Candidate", "followups@example.com");
    await page.getByRole("button", { name: "Type / code" }).click();
    await page.getByPlaceholder("Answer by typing or speaking...").fill("I coordinated mitigation, rollback, stakeholder updates, and a durable remediation plan.");
    await page.getByRole("button", { name: "I’m done" }).click();

    for (let index = 0; index < followUpQuestions.length; index += 1) {
        await expect(page.getByText("Follow-up", { exact: true })).toBeVisible();
        await expect(page.getByRole("heading", { name: followUpQuestions[index] })).toBeVisible();
        const response = page.getByPlaceholder("Answer by typing or speaking...");
        await response.fill(`Evidence for follow-up ${index + 1}`);
        await page.getByRole("button", { name: "I’m done" }).click();
    }

    await expect(page.getByRole("heading", { name: "Thanks — that wraps up Incident response." })).toBeVisible();
    await expect(page.getByText(/That gives me what I need from the interview/)).toBeVisible();
    expect(answerRequests).toBe(4);
    expect(currentQuestion.followUps).toHaveLength(3);
    expect(currentQuestion.followUpNumber).toBe(0);

    await page.getByRole("button", { name: "Review and submit" }).click();
    await expect(page.getByRole("heading", { name: "Ready to submit?" })).toBeVisible();
    await expect(page.getByText(/won’t be able to change/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit assessment" })).toBeEnabled();
    await page.getByRole("button", { name: "Submit assessment" }).click();
    await expect(page.getByRole("heading", { name: "Assessment submitted" })).toBeVisible();
});

test("candidate reload restores the exact saved question without starting a second session", async ({ page }) => {
    await mockSignedOut(page);
    const shareToken = "share-recovery";
    const first = { _id: "q1", text: "How do you make deploys safe?", answer: "", followUpNumber: 0, followUps: [] };
    const second = { _id: "q2", text: "How do you validate rollback readiness?", answer: "", followUpNumber: 0, followUps: [] };
    const round = { _id: "round-recovery", name: "Reliability", deliveryMode: "conversational", adaptive: false, questions: [first, second] };
    let startCalls = 0;

    await page.route(`**/api/assessments/public/${shareToken}`, (route) => json(route, {
        title: "Recovery-safe assessment",
        jobRole: "Engineer",
        durationMinutes: 20,
        followUpsEnabled: false,
        rounds: [{ name: round.name, deliveryMode: round.deliveryMode, adaptive: false, questionCount: 2 }],
    }));
    await page.route(`**/api/assessments/public/${shareToken}/start`, (route) => {
        startCalls += 1;
        return json(route, { attemptToken: "recovery-secret", attempt: { _id: "attempt-recovery", startedAt: new Date().toISOString(), rounds: [round] } }, 201);
    });
    await page.route(`**/api/assessments/public/${shareToken}/attempts/attempt-recovery/answer`, async (route) => {
        const body = await route.request().postDataJSON();
        return json(route, {
            attempt: {
                _id: "attempt-recovery",
                rounds: [{ ...round, questions: [{ ...first, answer: body.answer }, second] }],
            },
        });
    });

    await startPublicAssessment(page, shareToken, "Recovery Candidate", "recovery@example.com");
    const savedAnswer = "I use canaries, health gates, automated rollback triggers, and tested runbooks.";
    await page.getByRole("button", { name: "Type / code" }).click();
    await page.getByPlaceholder("Answer by typing or speaking...").fill(savedAnswer);
    await page.getByRole("button", { name: "I’m done" }).click();
    await expect(page.getByRole("heading", { name: second.text })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: second.text })).toBeVisible();
    await expect(page.getByRole("heading", { name: first.text })).toHaveCount(0);
    expect(startCalls).toBe(1);
});

test("recruiter report renders the complete follow-up evidence chain on the canonical Hire route", async ({ page }) => {
    await mockSignedIn(page);
    await page.route("**/api/assessments/report-followups", (route) => json(route, {
        assessment: {
            _id: "report-followups",
            title: "Backend evidence interview",
            status: "active",
            jobRole: "Backend Engineer",
            shareToken: "share-report",
            invitations: [],
            rubric: [{ _id: "rubric-1", name: "Technical judgment", description: "Grounded production decisions", weight: 1 }],
        },
        attempts: [{
            _id: "attempt-report",
            candidateName: "Evidence Candidate",
            candidateEmail: "evidence@example.com",
            status: "submitted",
            startedAt: "2026-09-01T10:00:00Z",
            submittedAt: "2026-09-01T10:30:00Z",
            overallScore: 8.4,
            rounds: [{
                _id: "round-report",
                name: "Technical",
                score: 8.4,
                questions: [{
                    _id: "q-report",
                    text: "How do you secure an API?",
                    answer: "Use scoped authorization, short-lived credentials, rate limits, and audit logs.",
                    score: 8.4,
                    feedbackComment: "Strong grounded evidence",
                    suggestions: [],
                    followUps: [
                        { question: "How do you rotate credentials?", answer: "Automated rotation with short overlap windows." },
                        { question: "How do you detect abuse?", answer: "Rate limits, anomaly signals, and auditable security events." },
                        { question: "What failure mode remains?", answer: "Upstream identity compromise still requires independent detection." },
                    ],
                }],
            }],
        }],
    }));

    await page.goto("/hire/assessments/report-followups");
    await expect(page.getByRole("heading", { name: "Backend evidence interview", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: /Technical/ }).click();
    await expect(page.getByText("AI follow-up 1: How do you rotate credentials?", { exact: true })).toBeVisible();
    await expect(page.getByText("AI follow-up 2: How do you detect abuse?", { exact: true })).toBeVisible();
    await expect(page.getByText("AI follow-up 3: What failure mode remains?", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Preview candidate experience" })).toHaveAttribute("href", "/hire/assessments/report-followups/preview");
});
