import { beat, caption, expect, glideTo, hideCaption, json, test, titleCard, typeInto } from "./demoKit.js";

// Recording #3 from the marketing plan: a shallow answer gets probed with adaptive follow-ups.
test("I said use Redis - adaptive follow-ups", async ({ page }) => {
    const shareToken = "demo-redis";
    const attemptId = "attempt-redis";
    const followUps = [
        "Why Redis rather than relying on the database's own cache or read replicas?",
        "What happens to the product pages when the Redis cluster becomes unavailable?",
        "How do you keep cached prices consistent when a price changes?",
    ];
    const answers = [
        "Reads are roughly 50x writes and the hot set is small, so an in-memory cache absorbs most traffic. Replicas would still pay the full query cost on every read.",
        "Reads fall back to the database behind a circuit breaker, with request coalescing so a cold cache does not stampede the primary. Latency rises, but correctness holds.",
        "Price updates publish an event that deletes the key, plus a short TTL as a safety net. Checkout always re-reads the price from the database.",
    ];
    const round = { _id: "round-1", name: "Backend system design", deliveryMode: "conversational", adaptive: false };
    let question = {
        _id: "q-1",
        text: "Product pages serve 20,000 reads per second. How would you design the read path for the product catalog?",
        answer: "", followUpNumber: 0, followUpQuestion: "", followUpAnswer: "", followUps: [],
    };
    const attempt = () => ({ _id: attemptId, startedAt: new Date().toISOString(), rounds: [{ ...round, questions: [question] }] });

    await page.route("**/api/auth/refresh", (route) => json(route, { message: "Unauthenticated" }, 401));
    await page.route(`**/api/assessments/public/${shareToken}`, (route) => json(route, {
        title: "Senior Backend Engineer interview",
        jobRole: "Senior Backend Engineer",
        durationMinutes: 30,
        followUpsEnabled: true,
        rounds: [{ name: round.name, deliveryMode: "conversational", adaptive: false, questionCount: 1 }],
    }));
    await page.route(`**/api/assessments/public/${shareToken}/start`, (route) => json(route, { attemptToken: "demo-token", attempt: attempt() }, 201));
    await page.route(`**/api/assessments/public/${shareToken}/attempts/${attemptId}/answer`, async (route) => {
        const body = await route.request().postDataJSON();
        // Give the interviewer a believable moment to "think" before the next probe appears.
        await new Promise((resolve) => setTimeout(resolve, 1400));
        if (body.answer) {
            question = { ...question, answer: body.answer, followUpQuestion: followUps[0], followUpNumber: 1 };
        } else {
            const done = [...question.followUps, { question: question.followUpQuestion, answer: body.followUpAnswer }];
            question = done.length < followUps.length
                ? { ...question, followUps: done, followUpQuestion: followUps[done.length], followUpAnswer: "", followUpNumber: done.length + 1 }
                : { ...question, followUps: done, followUpQuestion: "", followUpAnswer: "", followUpNumber: 0 };
        }
        return json(route, { attempt: attempt() });
    });

    await page.goto(`/assessment/${shareToken}`);
    await titleCard(page, "I said “use Redis.”", "Here’s what an adaptive AI interviewer does next.", 3400);

    await caption(page, "A candidate joins a backend interview", "", 1800);
    await typeInto(page, page.getByLabel("Full name"), "Priya Sharma");
    await typeInto(page, page.getByLabel("Email address"), "priya@example.com", { delay: 25 });
    await glideTo(page, page.getByRole("checkbox").first());
    await glideTo(page, page.getByRole("button", { name: "Start assessment" }));
    await hideCaption(page);

    await expect(page.getByRole("heading", { name: question.text })).toBeVisible();
    await beat(page, 1600);
    await glideTo(page, page.getByRole("button", { name: "Type / code" }));
    const response = page.getByPlaceholder("Answer by typing or speaking...");
    await caption(page, "The lazy answer", "Technically fine. Tells the interviewer almost nothing.", 0);
    await typeInto(page, response, "I'd put Redis in front of the database.", { delay: 55 });
    await beat(page, 1500);
    await glideTo(page, page.getByRole("button", { name: "I’m done" }));
    await hideCaption(page);

    const probes = [
        ["Follow-up 1: justify the choice", "Why this component, instead of the obvious alternatives?"],
        ["Follow-up 2: failure handling", "What breaks when the cache does?"],
        ["Follow-up 3: correctness", "Caches go stale. How do you keep prices right?"],
    ];
    for (let index = 0; index < followUps.length; index += 1) {
        await expect(page.getByRole("heading", { name: followUps[index] })).toBeVisible({ timeout: 15000 });
        await caption(page, ...probes[index], 2800);
        await hideCaption(page);
        await typeInto(page, page.getByPlaceholder("Answer by typing or speaking..."), answers[index], { delay: 14 });
        await beat(page, 900);
        await glideTo(page, page.getByRole("button", { name: "I’m done" }));
    }

    await expect(page.getByRole("heading", { name: /that wraps up/i })).toBeVisible({ timeout: 15000 });
    await caption(page, "Scored on evidence, not keywords", "Reasoning · trade-offs · failure handling · scalability · correctness", 3600);
    await hideCaption(page);
    await titleCard(page, "A correct answer isn’t a good engineering answer.", "Practice free at practice.evalcueai.com", 4200);
});
