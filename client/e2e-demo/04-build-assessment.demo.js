import { beat, caption, expect, glideTo, hideCaption, json, test, titleCard, typeInto } from "./demoKit.js";

// Recording #6 from the marketing plan: build a multi-round engineering assessment in minutes.
test("Build an engineering assessment", async ({ page }) => {
    let published = null;

    await page.route("**/api/auth/refresh", (route) => json(route, { token: "demo-access-token" }));
    await page.route("**/api/auth/profile", (route) => json(route, { _id: "user-1", name: "Maya Chen", email: "maya@acme.example", role: "user", practicePlan: "free" }));
    await page.route("**/api/auth/reminders/deliveries", (route) => json(route, { items: [] }));
    await page.route("**/api/organizations", (route) => json(route, { organizations: [{ _id: "org-1", name: "Acme Engineering", role: "owner", memberCount: 6 }] }));
    await page.route("**/api/billing/hiring/entitlements", (route) => json(route, {
        product: "hiring", organization: { _id: "org-1", name: "Acme Engineering" }, plan: "growth", subscriptionStatus: "active",
        period: "month", periodType: "month", limits: { candidateInterviews: 100 }, used: { candidateInterviews: 14 },
        planLimits: { growth: { candidateInterviews: 100 } }, prices: {}, billingAvailable: {}, canManageBilling: true,
    }));
    await page.route("**/api/assessments/overview**", (route) => json(route, { summary: {}, assessments: [], candidates: [], totalPages: 1 }));
    await page.route("**/api/assessments?**", (route) => json(route, { items: [], totalPages: 1 }));
    await page.route("**/api/assessments", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        published = route.request().postDataJSON();
        await new Promise((resolve) => setTimeout(resolve, 900));
        return json(route, { _id: "demo-built", shareToken: "demo-built-share", ...published }, 201);
    });
    await page.route("**/api/assessments/demo-built", (route) => json(route, {
        assessment: { _id: "demo-built", shareToken: "demo-built-share", invitations: [], ...published, status: "active" },
        attempts: [],
    }));

    await page.goto("/hire/assessments?create=1");
    await titleCard(page, "Build a technical assessment in about three minutes.", "Discussion, coding, and system design, with one shared rubric", 3600);
    await expect(page.getByText("Step 1 of 4")).toBeVisible();

    await caption(page, "Step 1: start from the role", "", 0);
    await typeInto(page, page.getByRole("textbox", { name: "Job role" }), "Senior Backend Engineer", { delay: 40 });
    await typeInto(page, page.getByLabel("Assessment name"), "Senior Backend Engineer, first round", { delay: 30 });
    await typeInto(page, page.getByLabel("Job description and success criteria"), "Owns high-traffic APIs and data stores. Success means sound trade-offs under load, designing for failure, clean production code, and clear communication.", { delay: 12 });
    await hideCaption(page);
    await glideTo(page, page.getByRole("button", { name: "Continue" }));
    await expect(page.getByText("Step 2 of 4")).toBeVisible();

    await caption(page, "Step 2: choose the interview rounds", "Each round measures a different engineering signal.", 0);
    await typeInto(page, page.getByLabel("Maximum primary questions").first(), "2", { delay: 80 });
    await glideTo(page, page.getByRole("button", { name: "Add another round" }));
    await glideTo(page, page.getByRole("button", { name: "Add another round" }));
    await glideTo(page, page.getByLabel("Format").nth(1));
    await glideTo(page, page.getByRole("option", { name: "Coding / written assessment" }));
    await typeInto(page, page.getByLabel("Round name").nth(1), "Production coding", { delay: 40 });
    await typeInto(page, page.getByLabel("Question count").first(), "1", { delay: 80 });
    await glideTo(page, page.getByLabel("Format").nth(2));
    await glideTo(page, page.getByRole("option", { name: "System design" }));
    await typeInto(page, page.getByLabel("Round name").nth(2), "System design", { delay: 40 });
    await hideCaption(page);
    await glideTo(page, page.getByRole("button", { name: "Continue" }));
    await expect(page.getByText("Step 3 of 4")).toBeVisible();

    await caption(page, "Step 3: set the primary questions", "The AI interviewer asks adaptive follow-ups from here.", 0);
    await glideTo(page, page.getByRole("button", { name: "Add question" }).nth(0));
    await typeInto(page, page.getByRole("textbox", { name: "Question 1", exact: true }).nth(0), "Tell me about a production incident you owned end to end. What changed afterwards?", { delay: 14 });
    await glideTo(page, page.getByRole("button", { name: "Add question" }).nth(1));
    await typeInto(page, page.getByRole("textbox", { name: "Question 1", exact: true }).nth(1), "Implement a rate limiter that allows N requests per user per minute.", { delay: 14 });
    await glideTo(page, page.getByRole("button", { name: "Add question" }).nth(2));
    await typeInto(page, page.getByRole("textbox", { name: "Question 1", exact: true }).nth(2), "Design a notification service that delivers 50 million messages a day.", { delay: 14 });
    await hideCaption(page);
    await glideTo(page, page.getByRole("button", { name: "Continue" }));
    await expect(page.getByText("Step 4 of 4")).toBeVisible();

    await caption(page, "Step 4: review and publish", "", 2600);
    await hideCaption(page);
    await glideTo(page, page.getByRole("button", { name: "Publish assessment" }));
    await expect.poll(() => published?.rounds?.length).toBe(3);
    await beat(page, 2400);
    await caption(page, "Published. Share one link or invite candidates.", "Every candidate gets the same structured assessment.", 3400);
    await hideCaption(page);

    await titleCard(page, "Consistent technical signal, from the first round.", "Start a pilot at hiring.evalcueai.com", 4200);
});
