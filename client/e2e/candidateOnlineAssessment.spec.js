import { expect, test } from "./fixtures.js";

const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const problems = [
    { _id: "q-1", text: "Reverse a singly linked list.", answer: "" },
    { _id: "q-2", text: "Find the first non-repeating character.", answer: "" },
];

test("candidate moves between problems, answers a follow-up, and reaches submission", async ({ page }) => {
    await page.route("**/api/auth/refresh", (route) => json(route, { message: "Unauthenticated" }, 401));
    let attempt = { _id: "attempt-oa", status: "started", rounds: [{ _id: "round-oa", name: "Coding", deliveryMode: "online-assessment", questions: problems.map((item) => ({ ...item })) }] };
    const saves = [];
    await page.route("**/api/assessments/public/share-oa", (route) => json(route, { title: "Backend screen", jobRole: "Backend Engineer", durationMinutes: 30, followUpsEnabled: true, rounds: [{ name: "Coding", deliveryMode: "online-assessment", questionCount: 2 }] }));
    await page.route("**/api/assessments/public/share-oa/start", (route) => json(route, { attempt, attemptToken: "oa-secret" }, 201));
    await page.route("**/api/assessments/public/share-oa/attempts/attempt-oa/answer", async (route) => {
        const body = await route.request().postDataJSON();
        saves.push(body);
        const questions = attempt.rounds[0].questions.map((question, index) => {
            if (index !== body.questionIndex) return question;
            if (body.followUpAnswer) return { ...question, followUpAnswer: body.followUpAnswer, followUpNumber: 0 };
            // The first problem's answer triggers an interviewer follow-up; like the real API, followUpNumber
            // marks it pending until answered.
            return { ...question, answer: body.answer, ...(index === 0 ? { followUpQuestion: "What is the space complexity of your approach?", followUpNumber: 1 } : {}) };
        });
        attempt = { ...attempt, rounds: [{ ...attempt.rounds[0], questions }] };
        return json(route, { attempt });
    });

    await page.goto("/assessment/share-oa");
    await page.getByLabel("Full name").fill("OA Candidate");
    await page.getByLabel("Email address").fill("oa@example.com");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Start assessment" }).click();

    await expect(page.getByText("Online assessment · Problem 1 of 2")).toBeVisible();
    await expect(page.getByText("Not answered")).toBeVisible();
    await page.getByRole("button", { name: "Next problem" }).click();
    await expect(page.getByRole("heading", { name: problems[1].text })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next problem" })).toHaveCount(0);
    await page.getByRole("button", { name: "Previous" }).click();
    await expect(page.getByRole("heading", { name: problems[0].text })).toBeVisible();

    await page.getByPlaceholder("Answer by typing or speaking...").fill("Iterate with prev/current pointers and flip each next link.");
    await page.getByRole("button", { name: "Save and continue" }).click();

    await expect(page.getByText("INTERVIEWER FOLLOW-UP")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save and continue" })).toBeDisabled();
    await page.getByLabel("Your follow-up answer").fill("O(1) extra space; only three pointers.");
    await page.getByRole("button", { name: "Save follow-up" }).click();

    await expect(page.getByRole("heading", { name: problems[1].text })).toBeVisible();
    await page.getByPlaceholder("Answer by typing or speaking...").fill("Count characters, then return the first with count one.");
    await page.getByRole("button", { name: "Save and review round" }).click();

    await expect(page.getByRole("button", { name: "Review and submit" }).first()).toBeVisible();
    expect(saves.map((body) => [body.questionIndex, body.followUpAnswer ? "follow-up" : "answer"])).toEqual([[0, "answer"], [0, "follow-up"], [1, "answer"]]);
});
