import { beat, caption, expect, hideCaption, scrollToReveal, test, titleCard } from "./demoKit.js";

// Recording #5 from the marketing plan: a guided tour of how answers are actually scored.
const STOPS = [
    ["1. Each round starts with an evidence plan", "Three to six competencies, weighted for the role", "Before the first question, EvalcueAI decides what it needs evidence for."],
    ["2. Answers are scored on evidence, with separate confidence", "A thin answer means low confidence, not just a low score", "No credit for knowledge the candidate didn't state."],
    ["3. Follow-ups target the weakest evidence", "Weight × uncertainty decides the next question", "Resume claims are probed, never invented."],
    ["4. Difficulty adapts gradually", "At most one level per question", "One weak answer doesn't make the interview easy."],
    ["8. A correct answer is not the same as a good engineering answer", "“Use Redis” vs. “use Redis because… and when it fails…”", "",
        "A correct answer isn't a good engineering answer. Use Redis, is not the same as, use Redis because of this access pattern, and here's what happens when it fails."],
    ["9. Humans own every hiring decision", "AI-vs-reviewer calibration flags gaps of 1.5+ points", "",
        "Humans own every hiring decision. Calibration flags any gap of one and a half points or more between A.I. and reviewer scores."],
];

test("How EvalcueAI evaluates - methodology tour", async ({ page }) => {
    await page.route("**/api/auth/refresh", (route) => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
    await page.goto("/ai-interview-evaluation-methodology");
    await titleCard(page, "“AI-powered” tells you nothing.", "Here is exactly how EvalcueAI scores an engineering interview.", 3800);
    await expect(page.getByRole("heading", { level: 1, name: "How EvalcueAI Evaluates Engineering Interviews" })).toBeVisible();
    await beat(page, 2200);

    for (const [heading, headline, detail, say] of STOPS) {
        await scrollToReveal(page, page.getByRole("heading", { name: heading }), 110);
        await caption(page, headline, detail, 3600, say);
        await hideCaption(page, 250);
    }

    const example = page.getByRole("heading", { name: "Example: one answer, three follow-ups" });
    await scrollToReveal(page, example, 110);
    await caption(page, "See it on an example exchange", "", 2600);
    await hideCaption(page, 200);
    await scrollToReveal(page, page.getByText("What EvalcueAI evaluates here"), 360);
    await beat(page, 3000);

    await titleCard(page, "Read the full methodology.", "evalcueai.com/ai-interview-evaluation-methodology", 4200,
        "Read the full methodology at eval cue A.I. dot com.");
});
