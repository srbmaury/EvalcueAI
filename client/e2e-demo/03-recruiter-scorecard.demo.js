import { beat, caption, expect, glideTo, hideCaption, json, scrollToReveal, test, titleCard, typeInto } from "./demoKit.js";

// Recording #7 from the marketing plan: evidence-backed scorecards, and a human owns the decision.
const ASSESSMENT_ID = "demo-report";

const rubric = [
    { _id: "c1", name: "Technical judgment", description: "Grounded, justified technical decisions", weight: 1.5 },
    { _id: "c2", name: "Failure handling", description: "Anticipates and designs for failure", weight: 1 },
    { _id: "c3", name: "Communication", description: "Clear, structured explanation", weight: 1 },
];

const priya = {
    _id: "attempt-priya",
    candidateName: "Priya Sharma",
    candidateEmail: "priya@example.com",
    status: "submitted",
    startedAt: "2026-09-24T10:00:00Z",
    submittedAt: "2026-09-24T10:34:00Z",
    overallScore: 8.2,
    reviewerScore: null,
    reviewerDecision: "",
    reviewerNotes: "",
    reviewerRatings: [],
    rounds: [{
        _id: "round-sd",
        name: "Backend system design",
        deliveryMode: "conversational",
        score: 8.2,
        questions: [{
            _id: "q-catalog",
            text: "Product pages serve 20,000 reads per second. How would you design the read path for the product catalog?",
            answer: "I'd put Redis in front of the database.",
            competencies: ["Technical judgment", "Failure handling"],
            weight: 1.5,
            score: 8.2,
            feedbackComment: "The first answer was thin, but the follow-ups showed strong judgment: a quantified read/write ratio justified the cache, the cache-outage plan included stampede protection, and price consistency was handled with event-driven invalidation plus a checkout re-read.",
            suggestions: ["Quantify the latency budget when reads fall back to the database."],
            followUps: [
                { question: "Why Redis rather than relying on the database's own cache or read replicas?", answer: "Reads are roughly 50x writes and the hot set is small, so an in-memory cache absorbs most traffic. Replicas would still pay the full query cost on every read." },
                { question: "What happens to the product pages when the Redis cluster becomes unavailable?", answer: "Reads fall back to the database behind a circuit breaker, with request coalescing so a cold cache does not stampede the primary. Latency rises, but correctness holds." },
                { question: "How do you keep cached prices consistent when a price changes?", answer: "Price updates publish an event that deletes the key, plus a short TTL as a safety net. Checkout always re-reads the price from the database." },
            ],
        }],
    }],
};

const daniel = {
    ...priya,
    _id: "attempt-daniel",
    candidateName: "Daniel Okafor",
    candidateEmail: "daniel@example.com",
    submittedAt: "2026-09-24T15:12:00Z",
    overallScore: 6.1,
    rounds: [{
        ...priya.rounds[0],
        score: 6.1,
        questions: [{
            ...priya.rounds[0].questions[0],
            answer: "Add a cache layer and read replicas, then scale horizontally behind a load balancer.",
            score: 6.1,
            feedbackComment: "Named reasonable components but did not justify them against the access pattern, and did not address cache failure or stale prices.",
            suggestions: ["Explain what happens when the cache is unavailable.", "Address consistency when prices change."],
            followUps: [
                { question: "Why both a cache and read replicas?", answer: "It's the standard way to scale reads." },
                { question: "What happens when the cache is unavailable?", answer: "Requests would go to the database." },
            ],
        }],
    }],
};

test("Recruiter scorecard with human decision", async ({ page }) => {
    let attempts = [priya, daniel];

    await page.route("**/api/auth/refresh", (route) => json(route, { token: "demo-access-token" }));
    await page.route("**/api/auth/profile", (route) => json(route, { _id: "user-1", name: "Maya Chen", email: "maya@acme.example", role: "user", practicePlan: "free" }));
    await page.route("**/api/auth/reminders/deliveries", (route) => json(route, { items: [] }));
    await page.route("**/api/organizations", (route) => json(route, { organizations: [{ _id: "org-1", name: "Acme Engineering", role: "owner", memberCount: 6 }] }));
    await page.route("**/api/billing/hiring/entitlements", (route) => json(route, {
        product: "hiring", organization: { _id: "org-1", name: "Acme Engineering" }, plan: "growth", subscriptionStatus: "active",
        period: "month", periodType: "month", limits: { candidateInterviews: 100 }, used: { candidateInterviews: 14 },
        planLimits: { growth: { candidateInterviews: 100 } }, prices: {}, billingAvailable: {}, canManageBilling: true,
    }));
    await page.route(`**/api/assessments/${ASSESSMENT_ID}`, (route) => json(route, {
        assessment: {
            _id: ASSESSMENT_ID,
            title: "Senior Backend Engineer",
            status: "active",
            jobRole: "Senior Backend Engineer",
            shareToken: "demo-share",
            invitations: [],
            rubric,
        },
        attempts,
    }));
    // Mirrors the server rule: a hiring decision cannot be saved without a written evidence note.
    await page.route(`**/api/assessments/${ASSESSMENT_ID}/attempts/*/review`, async (route) => {
        const body = route.request().postDataJSON();
        await new Promise((resolve) => setTimeout(resolve, 600));
        if (body.reviewerDecision && (body.reviewerNotes || "").trim().length < 10) {
            return json(route, { message: "Add evidence explaining the hiring decision." }, 400);
        }
        attempts = attempts.map((attempt) => (attempt._id === priya._id ? { ...attempt, ...body, reviewedAt: new Date().toISOString() } : attempt));
        return json(route, { ok: true });
    });

    await page.goto(`/hire/assessments/${ASSESSMENT_ID}`);
    await titleCard(page, "AI collects the evidence. Your team makes the call.", "An EvalcueAI Hire candidate report", 3600);
    await expect(page.getByRole("heading", { name: "Senior Backend Engineer", level: 1 })).toBeVisible();

    await caption(page, "One shared scorecard for every candidate", "Weighted criteria, defined before anyone is interviewed.", 3200);
    await hideCaption(page);

    const comparison = page.getByRole("heading", { name: "Candidate comparison" });
    if (await comparison.count()) {
        await scrollToReveal(page, comparison);
        await caption(page, "Compare candidates on the same evidence", "", 2800);
        await hideCaption(page);
    }

    const roundToggle = page.getByRole("button", { name: /Backend system design/ }).first();
    await caption(page, "Open Priya's system-design round", "", 0);
    await glideTo(page, roundToggle);
    await hideCaption(page);
    const firstFollowUp = page.getByText(/AI follow-up 1:/).first();
    await expect(firstFollowUp).toBeVisible();
    await scrollToReveal(page, page.getByText("I'd put Redis in front of the database.").first());
    await caption(page, "The first answer was thin…", "…so the AI interviewer followed up three times.", 3400);
    await hideCaption(page);
    await scrollToReveal(page, page.getByText(/AI follow-up 3:/).first(), 260);
    await beat(page, 1800);

    const aiAssessment = page.getByText(/AI assessment · 8\.2\/10/).first();
    await scrollToReveal(page, aiAssessment, 220);
    await caption(page, "Every score cites what the candidate actually said", "No credit for knowledge they didn't show.", 3600);
    await hideCaption(page);

    const scorecard = page.getByText("Human scorecard").first();
    await scrollToReveal(page, scorecard, 140);
    await caption(page, "Now a human reviews it", "", 2000);
    await hideCaption(page);
    await typeInto(page, page.getByLabel("Technical judgment score / 10").first(), "8.5", { delay: 90 });
    await typeInto(page, page.getByLabel("Evidence for Technical judgment").first(), "Justified the cache with a 50x read/write ratio.", { delay: 22 });
    await typeInto(page, page.getByLabel("Failure handling score / 10").first(), "8", { delay: 90 });
    await typeInto(page, page.getByLabel("Evidence for Failure handling").first(), "Circuit breaker plus request coalescing on cache loss.", { delay: 22 });

    await typeInto(page, page.getByLabel("Communication score / 10").first(), "7.5", { delay: 90 });
    await typeInto(page, page.getByLabel("Evidence for Communication").first(), "Clear once prompted; opening answer lacked structure.", { delay: 22 });

    await glideTo(page, page.getByRole("combobox", { name: "Decision" }).first());
    await glideTo(page, page.getByRole("option", { name: "Advance" }));
    await typeInto(page, page.getByLabel("Reviewer evidence and notes").first(), "LGTM", { delay: 90 });
    await caption(page, "Try to advance her without a reason…", "", 0);
    await glideTo(page, page.getByRole("button", { name: "Save review" }).first());
    await expect(page.getByText("Add evidence explaining the hiring decision.")).toBeVisible();
    await hideCaption(page);
    await caption(page, "Blocked. Every decision needs written evidence.", "", 3200);
    await hideCaption(page);

    await typeInto(page, page.getByLabel("Reviewer evidence and notes").first(), "Strong trade-off reasoning once probed: quantified the access pattern, planned for cache failure, and kept prices consistent. Advance to the architecture loop.", { delay: 16 });
    await glideTo(page, page.getByRole("button", { name: "Save review" }).first());
    await expect(page.getByText("Human review saved for Priya Sharma.")).toBeVisible();
    await glideTo(page, page.getByText("Reviewed", { exact: true }), { click: false, hover: 300 });
    await caption(page, "Human decision saved, with the evidence behind it", "", 3000);
    await hideCaption(page);

    await titleCard(page, "Structured technical hiring, human-controlled.", "Start a pilot at hiring.evalcueai.com", 4200);
});
