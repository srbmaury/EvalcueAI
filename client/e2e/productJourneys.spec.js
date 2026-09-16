import { expect, test } from "@playwright/test";

const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const mockSignedOut = async (page) => {
    await page.route("**/api/auth/refresh", (route) => json(route, { message: "Unauthenticated" }, 401));
};

const mockSignedIn = async (page, user = { _id: "user-1", name: "Recruiter One", email: "recruiter@example.com", role: "user", practicePlan: "free" }, organizationRole = "owner") => {
    await page.route("**/api/auth/refresh", (route) => json(route, { token: "test-access-token" }));
    await page.route("**/api/auth/profile", (route) => json(route, user));
    await page.route("**/api/auth/reminders/deliveries", (route) => json(route, { items: [] }));
    await page.route("**/api/organizations", (route) => json(route, {
        organizations: [{ _id: "org-1", name: "Acme Hiring", role: organizationRole, memberCount: 1 }],
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
        planLimits: { trial: { candidateInterviews: 5 }, starter: { candidateInterviews: 25 }, growth: { candidateInterviews: 100 }, enterprise: { candidateInterviews: 100000 } },
        prices: {},
        billingAvailable: {},
        canManageBilling: ["owner", "admin"].includes(organizationRole),
    }));
};

test("public homepage explains both candidate and recruiter value", async ({ page }) => {
    await mockSignedOut(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Prepare better. Hire with clearer evidence." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Practice interviews" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Assess candidates" })).toBeVisible();
    await expect(page.getByText("Hiring workspace", { exact: true })).toBeVisible();
});

test("login survives a browser reload through refresh-token restoration", async ({ page }) => {
    let authenticated = false;
    await page.route("**/api/auth/refresh", (route) => authenticated
        ? json(route, { token: "restored-access-token" })
        : json(route, { message: "Unauthenticated" }, 401));
    await page.route("**/api/auth/login", (route) => {
        authenticated = true;
        return json(route, { token: "initial-access-token" });
    });
    await page.route("**/api/auth/profile", (route) => json(route, { _id: "user-1", name: "Test User", email: "test@example.com", role: "user", practicePlan: "free" }));

    await page.goto("/login");
    await page.getByLabel("Email").fill("test@example.com");
    await page.locator("input#password").fill("StrongPass1!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/practice\/dashboard$/);

    await page.reload();
    await expect(page).toHaveURL(/\/practice\/dashboard$/);
    await expect(page.getByRole("heading", { name: /Welcome back, Test/ })).toBeVisible();
});

test("login returns the user to the protected screen they requested", async ({ page }) => {
    let authenticated = false;
    await page.route("**/api/auth/refresh", (route) => authenticated ? json(route, { token: "restored-access-token" }) : json(route, { message: "Unauthenticated" }, 401));
    await page.route("**/api/auth/login", (route) => { authenticated = true; return json(route, { token: "access-token" }); });
    await page.route("**/api/auth/profile", (route) => json(route, { _id: "user-1", name: "Test User", email: "test@example.com", role: "user", practicePlan: "free" }));
    await page.route("**/api/billing/practice/entitlements", (route) => json(route, { plan: "free", limits: { interviews: 3, resumeReviews: 3 }, used: { interviews: 0, resumeReviews: 0 }, planLimits: {}, prices: {}, billingAvailable: {} }));

    await page.goto("/pricing");
    await expect(page).toHaveURL(/\/practice\/login$/);
    await page.getByLabel("Email").fill("test@example.com");
    await page.locator("input#password").fill("StrongPass1!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/practice\/pricing$/);
    await expect(page.getByRole("heading", { name: "Choose your Practice plan" })).toBeVisible();
});

test("protected Practice and Hire URLs use their product-specific sign-in pages", async ({ page }) => {
    await mockSignedOut(page);
    await page.goto("/practice/new");
    await expect(page).toHaveURL(/\/practice\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in to Evalcue AI" })).toBeVisible();
    await page.goto("/hire/assessments");
    await expect(page).toHaveURL(/\/hire\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in to Evalcue AI" })).toBeVisible();
});

test("a signed-in hiring user can create their first organization", async ({ page }) => {
    const user = { _id: "user-new", name: "New Recruiter", email: "new@example.com", role: "user", practicePlan: "free" };
    let organizations = [];
    let submittedName;
    await page.route("**/api/auth/refresh", (route) => json(route, { token: "test-access-token" }));
    await page.route("**/api/auth/profile", (route) => json(route, user));
    await page.route("**/api/organizations", async (route) => {
        if (route.request().method() === "POST") {
            submittedName = (await route.request().postDataJSON()).name;
            const organization = { _id: "org-new", name: submittedName, role: "owner", memberCount: 1 };
            organizations = [organization];
            return json(route, { organization }, 201);
        }
        return json(route, { organizations });
    });
    await page.route("**/api/billing/hiring/entitlements", (route) => json(route, {
        product: "hiring", organization: { _id: "org-new", name: "Newco Engineering" }, plan: "trial",
        limits: { candidateInterviews: 5 }, used: { candidateInterviews: 0 }, planLimits: {}, prices: {}, billingAvailable: {}, canManageBilling: true,
    }));
    await page.route("**/api/assessments/overview**", (route) => json(route, { summary: {}, assessments: [], candidates: [], totalPages: 1 }));
    await page.route("**/api/assessments?**", (route) => json(route, { items: [], totalPages: 1 }));
    await page.goto("/hire/assessments");
    await expect(page.getByRole("heading", { name: "Create or join a hiring organization" })).toBeVisible();
    await page.getByLabel("Organization name").fill("Newco Engineering");
    await page.getByRole("button", { name: "Create organization" }).click();
    await expect.poll(() => submittedName).toBe("Newco Engineering");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
});

test("Practice and Hire stay separate while profile exposes core practice settings", async ({ page }) => {
    await mockSignedIn(page);
    await page.route("**/api/assessments/overview**", (route) => json(route, { summary: {}, assessments: [], candidates: [], totalPages: 1 }));
    await page.route("**/api/assessments?**", (route) => json(route, { items: [], totalPages: 1 }));
    await page.goto("/practice/profile");
    await expect(page).toHaveURL(/\/practice\/profile$/);
    await expect(page.getByRole("heading", { name: "Profile", level: 1 })).toBeVisible();
    await expect(page.getByText("Your workspace", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Plan & billing" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Security", exact: true })).toBeVisible();
    await expect(page.getByLabel("Role you’re targeting")).toBeVisible();
    await expect(page.getByLabel("Primary goal")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Weekly Practice Plan" })).toBeVisible();
    if ((page.viewportSize()?.width || 0) >= 900) {
        await expect(page.getByRole("button", { name: "Resume review" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Progress" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Company insights" })).toBeVisible();
    } else {
        await page.getByRole("button", { name: "Open navigation" }).click();
        await expect(page.getByRole("menuitem", { name: "Resume review" })).toBeVisible();
        await expect(page.getByRole("menuitem", { name: "Company insights" })).toBeVisible();
    }
    // The header no longer offers an in-app Practice/Hire switcher (workspace choice now
    // happens at signup/login, not mid-session); reaching Hire from a Practice session is a
    // direct navigation, same as a user following a link or typing the URL.
    await page.goto("/hire/assessments");
    await expect(page).toHaveURL(/\/hire\/assessments$/);
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    if ((page.viewportSize()?.width || 0) >= 900) {
        await page.getByRole("button", { name: "Candidates", exact: true }).click();
    } else {
        await page.getByRole("button", { name: "Open navigation" }).click();
        await page.getByRole("menuitem", { name: "Candidates", exact: true }).click();
    }
    await expect(page).toHaveURL(/\/hire\/assessments#candidate-pipeline$/);
    await expect(page.getByRole("heading", { name: "Candidate pipeline" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Overview" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Assessments" })).toHaveCount(0);
    if ((page.viewportSize()?.width || 0) >= 900) {
        await page.getByRole("button", { name: "Assessments", exact: true }).click();
    } else {
        await page.getByRole("button", { name: "Open navigation" }).click();
        await page.getByRole("menuitem", { name: "Assessments", exact: true }).click();
    }
    await expect(page).toHaveURL(/\/hire\/assessments#assessment-list$/);
    await expect(page.getByRole("heading", { name: "Assessments" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Candidate pipeline" })).toHaveCount(0);
    if ((page.viewportSize()?.width || 0) >= 900) {
        await page.getByRole("button", { name: "New assessment" }).click();
    } else {
        await page.getByRole("button", { name: "Open navigation" }).click();
        await page.getByRole("menuitem", { name: "New assessment" }).click();
    }
    await expect(page).toHaveURL(/\/hire\/assessments\?create=1$/);
    await expect(page.getByRole("heading", { name: "Create an assessment", exact: true })).toBeVisible();
    await expect(page.getByText("Step 1 of 4")).toBeVisible();
});

test("practice sub-features remain reachable after navigation cleanup", async ({ page }) => {
    await mockSignedIn(page);
    await page.route("**/api/resumes**", (route) => json(route, []));
    await page.route("**/api/experiences/saved**", (route) => json(route, { items: [], totalPages: 1 }));
    await page.goto("/practice/resume-review");
    await expect(page.getByRole("link", { name: "Resume library" })).toHaveAttribute("href", "/practice/resumes");
    await expect(page.getByRole("link", { name: "Past reviews" })).toHaveAttribute("href", "/practice/resume-reviews");
    await expect(page.getByRole("link", { name: "Find best match" })).toHaveAttribute("href", "/practice/resume-match");
    await page.goto("/practice/company-insights");
    await expect(page.getByRole("link", { name: "Saved insights" })).toHaveAttribute("href", "/practice/saved-experiences");
});

test("candidate can build a role-based interview plan and start it", async ({ page }) => {
    await mockSignedIn(page, { _id: "candidate-1", name: "Demo Candidate", email: "candidate@example.com", role: "user", practicePlan: "free" });
    let createdInterview;
    await page.route("**/api/resumes**", (route) => json(route, []));
    await page.route("**/api/rounds/suggest", async (route) => json(route, {
        rounds: [{ roundName: "Technical depth", description: "Test practical backend judgment.", recommended: true, deliveryMode: "conversational", questionLimit: 4 }],
        grounding: { status: "simulation", sourceCount: 0 },
    }));
    await page.route("**/api/interviews", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        createdInterview = await route.request().postDataJSON();
        return json(route, { _id: "interview-new", ...createdInterview }, 201);
    });
    await page.route("**/api/interviews/interview-new**", (route) => json(route, { _id: "interview-new", jobRole: "Backend Engineer", rounds: [] }));
    await page.goto("/practice/new");
    await expect(page.getByRole("heading", { name: "Build your interview plan" })).toBeVisible();
    await page.getByRole("button", { name: "Backend" }).click();
    await expect(page.getByLabel("Job role")).toHaveValue("Backend Engineer");
    await page.getByRole("button", { name: "Build my interview plan" }).click();
    await expect(page.getByRole("heading", { name: "Choose the rounds you want to practice" })).toBeVisible();
    await expect(page.getByText("Technical depth")).toBeVisible();
    await page.getByRole("button", { name: "Create interview" }).click();
    await expect.poll(() => createdInterview?.jobRole).toBe("Backend Engineer");
    expect(createdInterview.rounds).toHaveLength(1);
    expect(createdInterview.rounds[0]).toMatchObject({ roundName: "Technical depth", deliveryMode: "conversational", questionLimit: 4 });
    await expect(page).toHaveURL(/\/practice\/interviews\/interview-new$/);
});

test("recruiter can review and filter the cross-interview candidate pipeline", async ({ page }) => {
    await mockSignedIn(page);
    await page.route("**/api/assessments/overview**", (route) => json(route, {
        summary: { assessments: 2, activeAssessments: 1, totalCandidates: 3, submitted: 2, inProgress: 1, averageScore: 8.2 },
        assessments: [{ _id: "assessment-1", title: "Backend screen" }, { _id: "assessment-2", title: "Frontend screen" }],
        candidates: [{ _id: "attempt-1", candidateName: "Asha Candidate", candidateEmail: "asha@example.com", status: "submitted", overallScore: 8.5, startedAt: "2026-08-01T10:00:00Z", submittedAt: "2026-08-01T10:30:00Z", assessment: { _id: "assessment-1", title: "Backend screen", jobRole: "Backend Engineer", company: "Acme" } }],
        totalPages: 1,
    }));
    await page.route("**/api/assessments?**", (route) => json(route, { items: [{ _id: "assessment-1", title: "Backend screen", status: "active", jobRole: "Backend Engineer", organizationName: "Acme", shareToken: "share-1", attemptCount: 2, submittedCount: 1 }], totalPages: 1 }));
    await page.goto("/hire/assessments");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(page.getByText("Asha Candidate")).toBeVisible();
    await expect(page.getByText("8.5/10")).toBeVisible();
    await page.getByLabel("Search name or email").fill("Asha");
    await page.getByLabel("Status").click();
    await page.getByRole("option", { name: "Submitted" }).click();
    await expect(page.getByRole("link", { name: "Review" })).toHaveAttribute("href", "/hire/assessments/assessment-1");
});

test("recruiter can publish a hybrid assessment through the guided flow", async ({ page }) => {
    await mockSignedIn(page);
    let published;
    await page.route("**/api/assessments/overview**", (route) => json(route, { summary: {}, assessments: [], candidates: [], totalPages: 1 }));
    await page.route("**/api/assessments?**", (route) => json(route, { items: [], totalPages: 1 }));
    await page.route("**/api/assessments", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        published = await route.request().postDataJSON();
        return json(route, { _id: "assessment-hybrid", shareToken: "share-hybrid", ...published }, 201);
    });
    await page.goto("/hire/assessments?create=1");
    await expect(page.getByText("Step 1 of 4")).toBeVisible();
    await page.getByRole("textbox", { name: "Job role" }).fill("Senior Software Engineer");
    await page.getByLabel("Assessment name").fill("Hybrid engineering assessment");
    await page.getByLabel("Job description and success criteria").fill("Evaluate communication, production coding, system design, scalability, reliability, testing, and security judgment.");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Step 2 of 4")).toBeVisible();
    await page.getByLabel("Maximum primary questions").first().fill("1");
    await page.getByRole("button", { name: "Add another round" }).click();
    await page.getByRole("button", { name: "Add another round" }).click();
    await page.getByLabel("Format").nth(1).click();
    await page.getByRole("option", { name: "Coding / written assessment" }).click();
    await page.getByLabel("Round name").nth(1).fill("Coding exercise");
    await page.getByLabel("Question count").first().fill("1");
    await page.getByLabel("Format").nth(2).click();
    await page.getByRole("option", { name: "System design" }).click();
    await page.getByLabel("Round name").nth(2).fill("System design");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Step 3 of 4")).toBeVisible();
    await page.getByRole("button", { name: "Add question" }).nth(0).click();
    await page.getByRole("textbox", { name: "Question 1", exact: true }).nth(0).fill("Describe a production incident you led and what changed afterward.");
    await page.getByRole("button", { name: "Add question" }).nth(1).click();
    await page.getByRole("textbox", { name: "Question 1", exact: true }).nth(1).fill("Implement a function that returns the first non-repeating character.");
    await page.getByRole("button", { name: "Add question" }).nth(2).click();
    await page.getByRole("textbox", { name: "Question 1", exact: true }).nth(2).fill("Design a resilient global notification service.");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Step 4 of 4")).toBeVisible();
    await page.getByRole("button", { name: "Publish assessment" }).click();
    await expect.poll(() => published?.rounds?.map((round) => round.deliveryMode)).toEqual(["conversational", "online-assessment", "system-design"]);
    expect(published.status).toBe("active");
    expect(published.rounds.every((round) => round.questionCount === 1)).toBeTruthy();
});

test("reviewer can inspect Hiring but cannot create assessments", async ({ page }) => {
    await mockSignedIn(page, undefined, "reviewer");
    await page.route("**/api/assessments/overview**", (route) => json(route, { summary: {}, assessments: [], candidates: [], totalPages: 1 }));
    await page.route("**/api/assessments?**", (route) => json(route, { items: [], totalPages: 1 }));
    await page.route("**/api/organizations/org-1/members", (route) => json(route, {
        currentRole: "reviewer",
        members: [{ _id: "membership-1", role: "reviewer", joinedAt: "2026-09-03T00:00:00Z", user: { _id: "user-1", name: "Recruiter One", email: "recruiter@example.com" } }],
    }));
    await page.goto("/hire/assessments");
    await expect(page.getByRole("heading", { name: "Candidate pipeline" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Overview" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "New assessment" })).toHaveCount(0);
    if ((page.viewportSize()?.width || 0) >= 900) {
        await expect(page.getByRole("button", { name: "Team & billing" })).toHaveCount(0);
    } else {
        await page.getByRole("button", { name: "Open navigation" }).click();
        await expect(page.getByRole("menuitem", { name: "Team & billing" })).toHaveCount(0);
        await page.keyboard.press("Escape");
    }
    await page.goto("/hire/team");
    await expect(page).toHaveURL(/\/hire\/assessments#candidate-pipeline$/);
    await expect(page.getByRole("heading", { name: "Organization settings" })).toHaveCount(0);
});

test("candidate completes an assessment without seeing private feedback", async ({ page }) => {
    await mockSignedOut(page);
    const assessment = { title: "Backend screen", company: "Acme", jobRole: "Backend Engineer", durationMinutes: 20, followUpsEnabled: false, candidateInstructions: "Answer from your own experience.", rounds: [{ name: "Technical", deliveryMode: "conversational", questionCount: 1 }] };
    const attempt = { _id: "attempt-1", startedAt: new Date().toISOString(), rounds: [{ _id: "round-1", name: "Technical", description: "Practical judgment", deliveryMode: "conversational", adaptiveComplete: true, questions: [{ _id: "question-1", text: "How do you make an API reliable?", answer: "" }] }] };
    await page.route("**/api/assessments/public/share-1", (route) => json(route, assessment));
    await page.route("**/api/assessments/public/share-1/start", (route) => json(route, { attempt, attemptToken: "attempt-secret" }, 201));
    await page.route("**/api/assessments/public/share-1/attempts/attempt-1/answer", async (route) => {
        const body = await route.request().postDataJSON();
        return json(route, { attempt: { ...attempt, rounds: [{ ...attempt.rounds[0], questions: [{ ...attempt.rounds[0].questions[0], answer: body.answer }] }] } });
    });
    await page.route("**/api/assessments/public/share-1/attempts/attempt-1/submit", (route) => json(route, { received: true }));
    await page.goto("/assessment/share-1");
    await expect(page.getByRole("heading", { name: "Before you begin" })).toBeVisible();
    await expect(page.getByText(/score|private feedback/i)).toHaveCount(0);
    await page.getByLabel("Full name").fill("Asha Candidate");
    await page.getByLabel("Email address").fill("asha@example.com");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Start assessment" }).click();
    await page.getByRole("button", { name: "Type / code" }).click();
    await page.getByPlaceholder("Answer by typing or speaking...").fill("I use idempotency, timeouts, retries, monitoring, and tested rollback paths.");
    await page.getByRole("button", { name: "I’m done" }).click();
    await expect(page.getByRole("heading", { name: "Thanks — that wraps up Technical." })).toBeVisible();
    await page.getByRole("button", { name: "Review and submit" }).click();
    await expect(page.getByRole("heading", { name: "Ready to submit?" })).toBeVisible();
    await expect(page.getByText(/won’t be able to change/i)).toBeVisible();
    await page.getByRole("button", { name: "Submit assessment" }).click();
    await expect(page.getByRole("heading", { name: "Assessment submitted" })).toBeVisible();
    await expect(page.getByText(/score|feedback/i)).toHaveCount(0);
});

test("recruiter coding assessment uses the full interview workspace", async ({ page }) => {
    await mockSignedOut(page);
    const assessment = { title: "Frontend practical", company: "Acme", jobRole: "Frontend Engineer", durationMinutes: 30, followUpsEnabled: true, candidateInstructions: "Explain your tradeoffs aloud.", rounds: [{ name: "Coding", deliveryMode: "online-assessment", questionCount: 1 }] };
    const attempt = { _id: "attempt-code", rounds: [{ _id: "round-code", name: "Coding", description: "Implementation and communication", deliveryMode: "online-assessment", questions: [{ _id: "question-code", text: "Implement a function that removes duplicate IDs.", answer: "" }] }] };
    await page.route("**/api/assessments/public/share-code", (route) => json(route, assessment));
    await page.route("**/api/assessments/public/share-code/start", (route) => json(route, { attempt, attemptToken: "attempt-code-secret" }, 201));
    await page.goto("/assessment/share-code");
    await page.getByLabel("Full name").fill("Dev Candidate");
    await page.getByLabel("Email address").fill("dev@example.com");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Start assessment" }).click();
    await expect(page.getByRole("heading", { name: "Implement a function that removes duplicate IDs." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Speak question" })).toBeVisible();
    // The coding round now narrates the problem and listens hands-free (matching Practice's
    // OAForm), auto-starting the mic session instead of a push-to-talk "Start voice" button.
    await expect(page.getByText(/Mic (live|ready)/)).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Editor content" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Explain your approach" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Run" })).toBeVisible();
    await page.getByRole("button", { name: "Use text answer" }).click();
    await expect(page.getByPlaceholder("Answer by typing or speaking...")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Editor content" })).toHaveCount(0);
});

test("candidate stays focused on the active round instead of seeing the full interview plan", async ({ page }) => {
    await mockSignedOut(page);
    const rounds = [
        { _id: "round-talk", name: "Conversational", description: "Communication", deliveryMode: "conversational", questions: [{ _id: "question-talk", text: "Describe an incident you led.", answer: "" }] },
        { _id: "round-code", name: "Coding exercise", description: "Implementation", deliveryMode: "online-assessment", questions: [{ _id: "question-code", text: "Implement a function that removes duplicates.", answer: "" }] },
        { _id: "round-design", name: "System design", description: "Architecture", deliveryMode: "system-design", questions: [{ _id: "question-design", text: "Design a global notification service.", answer: "" }] },
    ];
    await page.route("**/api/assessments/public/share-hybrid", (route) => json(route, {
        title: "Three-format assessment", jobRole: "Senior Engineer", durationMinutes: 30,
        followUpsEnabled: false, candidateInstructions: "Explain your assumptions.",
        rounds: rounds.map(({ name, deliveryMode, questions }) => ({ name, deliveryMode, questionCount: questions.length })),
    }));
    await page.route("**/api/assessments/public/share-hybrid/start", (route) => json(route, {
        attempt: { _id: "attempt-hybrid", rounds }, attemptToken: "attempt-hybrid-secret",
    }, 201));
    await page.goto("/assessment/share-hybrid");
    await page.getByLabel("Full name").fill("Hybrid Candidate");
    await page.getByLabel("Email address").fill("hybrid@example.com");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Start assessment" }).click();
    await expect(page.getByRole("heading", { name: "Describe an incident you led." })).toBeVisible();
    await expect(page.getByText("Conversational", { exact: true })).toBeVisible();
    await expect(page.getByText("Coding exercise", { exact: true })).toHaveCount(0);
    await expect(page.getByText("System design", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Interview plan", { exact: true })).toHaveCount(0);
});

test("candidate stays on the question when saving fails", async ({ page }) => {
    await mockSignedOut(page);
    const assessment = { title: "Reliability screen", jobRole: "Engineer", durationMinutes: 20, followUpsEnabled: false, rounds: [{ name: "Technical", deliveryMode: "conversational", questionCount: 2 }] };
    const attempt = { _id: "attempt-failure", startedAt: new Date().toISOString(), rounds: [{ _id: "round-failure", name: "Technical", deliveryMode: "conversational", adaptiveComplete: true, questions: [
        { _id: "question-failure-1", text: "Describe your rollback strategy.", answer: "" },
        { _id: "question-failure-2", text: "How do you monitor deployments?", answer: "" },
    ] }] };
    await page.route("**/api/assessments/public/share-failure", (route) => json(route, assessment));
    await page.route("**/api/assessments/public/share-failure/start", (route) => json(route, { attempt, attemptToken: "attempt-failure-secret" }, 201));
    await page.route("**/api/assessments/public/share-failure/attempts/attempt-failure/answer", (route) => json(route, { message: "Temporary save failure" }, 503));
    await page.goto("/assessment/share-failure");
    await page.getByLabel("Full name").fill("Resilient Candidate");
    await page.getByLabel("Email address").fill("resilient@example.com");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Start assessment" }).click();
    await page.getByRole("button", { name: "Type / code" }).click();
    const answer = page.getByPlaceholder("Answer by typing or speaking...");
    await answer.fill("I use health gates, canaries, and a tested rollback command.");
    await page.getByRole("button", { name: "I’m done" }).click();
    await expect(page.getByText("Temporary save failure")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Describe your rollback strategy." })).toBeVisible();
    await expect(answer).toHaveValue("I use health gates, canaries, and a tested rollback command.");
});

test("supporting authenticated screens render without overflow", async ({ page }) => {
    test.setTimeout(60000);
    await mockSignedIn(page, { _id: "admin-1", name: "Admin User", email: "admin@example.com", role: "admin", plan: "scale" });
    await page.route("**/api/events", (route) => json(route, { recorded: true }, 201));
    await page.route("**/api/resumes**", (route) => json(route, []));
    await page.route("**/api/resumes/reviews**", (route) => json(route, { items: [], totalPages: 1 }));
    await page.route("**/api/experiences/saved**", (route) => json(route, { items: [], totalPages: 1 }));
    await page.route("**/api/interviews/analytics/progress**", (route) => json(route, { total: 0, completed: 0, averageScore: 0, improvement: 0, recentScores: [], skills: [] }));
    await page.route("**/api/billing/practice/entitlements**", (route) => json(route, { plan: "pro", limits: { interviews: 100, resumeReviews: 100 }, used: { interviews: 0, resumeReviews: 0 }, planLimits: {}, prices: {}, billingAvailable: {} }));
    await page.route("**/api/assessments/overview**", (route) => json(route, { summary: {}, assessments: [], candidates: [], totalPages: 1 }));
    await page.route("**/api/assessments?**", (route) => json(route, { items: [], totalPages: 1 }));
    await page.route("**/api/admin/overview**", (route) => json(route, { users: 0, activeSubscriptions: 0, openFeedback: 0, assessments: 0 }));
    await page.route("**/api/admin/feedback**", (route) => json(route, { items: [], totalPages: 1 }));
    await page.route("**/api/admin/audit**", (route) => json(route, { items: [], totalPages: 1 }));
    const screens = [
        ["/practice/profile", "Profile"],
        ["/practice/progress", "Your progress"],
        ["/practice/resumes", "Resumes"],
        ["/practice/resume-review", "AI resume review"],
        ["/practice/resume-reviews", "Resume review history"],
        ["/practice/resume-match", "Find your best resume for a job"],
        ["/practice/company-insights", "Company interview insights"],
        ["/practice/saved-experiences", "Saved company insights"],
        ["/practice/pricing", "Choose your Practice plan"],
        ["/hire/assessments", "Hiring workspace"],
        ["/admin/feedback", "Product feedback"],
        ["/admin/audit", "Audit activity"],
    ];
    for (const [path, heading] of screens) {
        await page.goto(path);
        await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    }
});

test("public account and legal screens have clear page titles without overflow", async ({ page }) => {
    await mockSignedOut(page);
    const screens = [
        ["/login", "Sign in to Evalcue AI"],
        ["/register", "Create your Evalcue AI account"],
        ["/forgot-password", "Forgot your password?"],
        ["/reset-password", "Reset your password"],
        ["/verify-email", "Verify your email"],
        ["/privacy", "Privacy notice"],
        ["/terms", "Terms of use"],
    ];
    for (const [path, heading] of screens) {
        await page.goto(path);
        await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    }
});
