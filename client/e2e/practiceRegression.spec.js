import { expect, test } from "@playwright/test";

const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const user = { _id: "practice-user", name: "Practice Candidate", email: "practice@example.com", role: "user", practicePlan: "free" };
const questionText = "Tell me about a production incident you handled.";
const followUpText = "What did you change so the incident would not repeat?";

const makeInterview = ({ answer = "", followUps = [] } = {}) => ({
    _id: "interview-regression",
    jobRole: "Backend Engineer",
    company: "Acme",
    rounds: [{ round: {
        _id: "round-regression",
        name: "Behavioral deep dive",
        description: "Communication and ownership",
        deliveryMode: "conversational",
        status: "in_progress",
        questionLimit: 1,
        conversationalIndex: 0,
        questions: [{
            question: { _id: "question-regression", text: questionText },
            answerGiven: answer,
            feedback: null,
            followUps,
        }],
    } }],
});

const mockAuth = async (page) => {
    await page.route("**/api/auth/refresh", (route) => json(route, { token: "access-token" }));
    await page.route("**/api/auth/profile", (route) => json(route, user));
    await page.route("**/api/organizations", (route) => json(route, { organizations: [] }));
    await page.route("**/api/events", (route) => json(route, { accepted: true }, 202));
};

const installVoiceHarness = async (page) => {
    await page.addInitScript(() => {
        window.__spoken = [];
        window.__recognitions = [];
        class FakeRecognition {
            constructor() { window.__recognitions.push(this); }
            start() { this.onstart?.(); }
            stop() { this.__expectedStop = true; this.onend?.(); }
            emitFinal(text) {
                const result = [{ transcript: text }];
                result.isFinal = true;
                this.onresult?.({ resultIndex: 0, results: [result] });
            }
        }
        window.SpeechRecognition = FakeRecognition;
        window.webkitSpeechRecognition = FakeRecognition;
        Object.defineProperty(window, "speechSynthesis", {
            configurable: true,
            value: {
                speaking: false,
                cancel() {},
                getVoices() { return []; },
                speak(utterance) {
                    this.speaking = true;
                    window.__spoken.push(utterance.text);
                    setTimeout(() => { this.speaking = false; utterance.onend?.(); }, 0);
                },
            },
        });
        Object.defineProperty(window, "SpeechSynthesisUtterance", {
            configurable: true,
            value: class { constructor(text) { this.text = text; } },
        });
        const stream = () => new MediaStream();
        Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
            getUserMedia: async () => stream(), enumerateDevices: async () => [], addEventListener() {}, removeEventListener() {},
        } });
        Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: async () => ({ state: "granted", onchange: null }) } });
    });
};

const openRound = async (page) => {
    await page.goto("/practice/interviews/interview-regression");
    await expect(page.getByRole("heading", { name: "Choose your next round" })).toBeVisible();
    await page.getByRole("button", { name: /Behavioral deep dive/i }).click();
    await expect(page.getByRole("heading", { name: questionText })).toBeVisible();
};

const originalQuestionSpeechCount = (spoken) => spoken.filter((text) => text.includes("Tell me about a production incident")).length;

test("follow-up TTS speaks only the follow-up and does not reread the original question", { tag: "@desktop-only" }, async ({ page }) => {
    await installVoiceHarness(page);
    await mockAuth(page);
    let state = makeInterview();
    await page.route("**/api/interviews/interview-regression", (route) => json(route, state));
    await page.route("**/api/questions/round-regression/answer", async (route) => {
        const body = await route.request().postDataJSON();
        state = makeInterview({ answer: body.answer, followUps: [{ question: followUpText, answer: "", skipped: false }] });
        return json(route, { done: false, followUp: followUpText, followUpNumber: 1 });
    });

    await openRound(page);

    // The regression is the transition into the follow-up. Record whatever the
    // opening-question TTS has done, then prove that transition does not speak
    // the original question again. This avoids coupling the test to microphone
    // readiness timing while still requiring the follow-up itself to be spoken.
    await page.waitForTimeout(500);
    const spokenBeforeFollowUp = await page.evaluate(() => window.__spoken);
    const originalCountBeforeFollowUp = originalQuestionSpeechCount(spokenBeforeFollowUp);

    await page.getByRole("button", { name: "Type / code" }).click();
    await page.getByPlaceholder("Answer by typing or speaking...").fill("I coordinated a rollback and added missing alerts.");
    await page.getByRole("button", { name: "Submit now" }).click();
    await expect(page.getByText(followUpText, { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate((followUp) => window.__spoken.filter((text) => text === followUp).length, followUpText)).toBe(1);
    await page.waitForTimeout(500);

    const spoken = await page.evaluate(() => window.__spoken);
    expect(originalQuestionSpeechCount(spoken)).toBe(originalCountBeforeFollowUp);
    expect(spoken.at(-1)).toBe(followUpText);
});

test("overlapping browser speech finals are merged without duplicating transcript text", { tag: "@desktop-only" }, async ({ page }) => {
    await installVoiceHarness(page);
    await mockAuth(page);
    await page.route("**/api/interviews/interview-regression", (route) => json(route, makeInterview()));

    await openRound(page);
    await expect.poll(() => page.evaluate(() => window.__recognitions.length)).toBeGreaterThan(0);
    await page.evaluate(() => window.__recognitions.at(-1).emitFinal("I would use Redis"));
    await page.evaluate(() => window.__recognitions.at(-1).emitFinal("Redis for caching"));

    await expect(page.getByText("I would use Redis for caching", { exact: true })).toBeVisible();
    await expect(page.getByText("I would use Redis Redis for caching", { exact: true })).toHaveCount(0);
});

test("manual Submit now sends one answer and does not fire a second silence submission", { tag: "@desktop-only" }, async ({ page }) => {
    await installVoiceHarness(page);
    await mockAuth(page);
    let answerPosts = 0;
    let state = makeInterview();
    await page.route("**/api/interviews/interview-regression", (route) => json(route, state));
    await page.route("**/api/questions/round-regression/answer", async (route) => {
        answerPosts += 1;
        const body = await route.request().postDataJSON();
        state = makeInterview({ answer: body.answer });
        return json(route, { done: false });
    });

    await openRound(page);
    await expect.poll(() => page.evaluate(() => window.__recognitions.length)).toBeGreaterThan(0);
    await page.evaluate(() => window.__recognitions.at(-1).emitFinal("I restored service and added alerts"));
    await expect(page.getByText("I restored service and added alerts", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Submit now" }).click();
    await expect.poll(() => answerPosts).toBe(1);
    await page.waitForTimeout(5600);
    expect(answerPosts).toBe(1);
});

test("typed Practice answer draft survives a browser reload before submission", async ({ page }) => {
    await installVoiceHarness(page);
    await mockAuth(page);
    await page.route("**/api/interviews/interview-regression", (route) => json(route, makeInterview()));

    await openRound(page);
    await page.getByRole("button", { name: "Type / code" }).click();
    const answer = page.getByPlaceholder("Answer by typing or speaking...");
    await answer.fill("Draft answer that must survive a reload.");
    await expect(answer).toHaveValue("Draft answer that must survive a reload.");

    await page.reload();
    await expect(page.getByRole("heading", { name: questionText })).toBeVisible();
    await page.getByRole("button", { name: "Type / code" }).click();
    await expect(page.getByPlaceholder("Answer by typing or speaking...")).toHaveValue("Draft answer that must survive a reload.");
});
