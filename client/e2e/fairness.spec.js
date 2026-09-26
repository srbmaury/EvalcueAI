import { expect, test } from "./fixtures.js";

const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

test("candidate can voluntarily self-identify after submitting", async ({ page }) => {
    await page.route("**/api/auth/refresh", (route) => json(route, { message: "Unauthenticated" }, 401));
    const attempt = { _id: "attempt-1", startedAt: new Date().toISOString(), rounds: [{ _id: "round-1", name: "Technical", deliveryMode: "conversational", adaptiveComplete: true, questions: [{ _id: "question-1", text: "How do you make an API reliable?", answer: "" }] }] };
    await page.route("**/api/assessments/public/share-fair", (route) => json(route, { title: "Backend screen", jobRole: "Backend Engineer", durationMinutes: 20, followUpsEnabled: false, rounds: [{ name: "Technical", deliveryMode: "conversational", questionCount: 1 }] }));
    await page.route("**/api/assessments/public/share-fair/start", (route) => json(route, { attempt, attemptToken: "attempt-secret" }, 201));
    await page.route("**/api/assessments/public/share-fair/attempts/attempt-1/answer", async (route) => {
        const body = await route.request().postDataJSON();
        return json(route, { attempt: { ...attempt, rounds: [{ ...attempt.rounds[0], questions: [{ ...attempt.rounds[0].questions[0], answer: body.answer }] }] } });
    });
    await page.route("**/api/assessments/public/share-fair/attempts/attempt-1/submit", (route) => json(route, { received: true }));
    let selfId;
    await page.route("**/api/assessments/public/share-fair/attempts/attempt-1/self-identification", async (route) => {
        expect(route.request().headers()["x-attempt-token"]).toBe("attempt-secret");
        selfId = await route.request().postDataJSON();
        return json(route, { saved: true });
    });

    await page.goto("/assessment/share-fair");
    await page.getByLabel("Full name").fill("Asha Candidate");
    await page.getByLabel("Email address").fill("asha@example.com");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Start assessment" }).click();
    await page.getByRole("button", { name: "Type / code" }).click();
    await page.getByPlaceholder("Answer by typing or speaking...").fill("Idempotency keys, timeouts, retries with backoff and alerting.");
    await page.getByRole("button", { name: "I’m done" }).click();
    await page.getByRole("button", { name: "Review and submit" }).click();
    await page.getByRole("button", { name: "Submit assessment" }).click();

    await expect(page.getByRole("heading", { name: "Assessment submitted" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Optional: voluntary self-identification" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit anonymously" })).toBeDisabled();
    await page.getByRole("combobox", { name: "Race / ethnicity" }).click();
    await page.getByRole("option", { name: "Asian" }).click();
    await page.getByRole("button", { name: "Submit anonymously" }).click();
    await expect.poll(() => selfId).toEqual({ sex: "", raceEthnicity: "asian" });
    await expect(page.getByText("Your answers were saved anonymously.")).toBeVisible();
});

test("owner sees the fairness report with flagged groups and suppressed small groups", async ({ page }) => {
    await page.route("**/api/auth/refresh", (route) => json(route, { token: "test-access-token" }));
    await page.route("**/api/auth/profile", (route) => json(route, { _id: "user-1", name: "Owner One", email: "owner@example.com", role: "user", practicePlan: "free" }));
    await page.route("**/api/organizations", (route) => json(route, { organizations: [{ _id: "org-1", name: "Acme Hiring", role: "owner", memberCount: 2 }] }));
    const section = (groups, notProvided = 1) => ({ groups, notProvided });
    await page.route("**/api/assessments/fairness**", (route) => json(route, {
        assessments: [{ _id: "a1", title: "Backend screen" }],
        attempts: 21,
        selfIdentified: 20,
        minGroupSize: 5,
        threshold: 0.8,
        scoring: { median: 6.5, total: 21, sex: section([{ key: "female", eligible: 10, favourable: 5, rate: 0.5, impactRatio: 1, flagged: false }, { key: "male", eligible: 8, favourable: 4, rate: 0.5, impactRatio: 1, flagged: false }]), raceEthnicity: section([]), intersectional: section([]) },
        selection: { total: 21, sex: section([
            { key: "female", eligible: 10, favourable: 8, rate: 0.8, impactRatio: 1, flagged: false },
            { key: "male", eligible: 8, favourable: 4, rate: 0.5, impactRatio: 0.625, flagged: true },
            { key: "nonbinary", eligible: 2, favourable: 1, rate: null, impactRatio: null, flagged: false, suppressed: true },
        ]), raceEthnicity: section([]), intersectional: section([]) },
    }));

    await page.goto("/hire/fairness");
    await expect(page.getByRole("heading", { name: "Fairness report", level: 1 })).toBeVisible();
    await expect(page.getByText("1 group below 0.80")).toBeVisible();
    await expect(page.getByText("0.63 · below 0.80")).toBeVisible();
    await expect(page.getByText("Fewer than 5").first()).toBeVisible();
    await expect(page.getByText(/not an independent bias audit/)).toBeVisible();
});
