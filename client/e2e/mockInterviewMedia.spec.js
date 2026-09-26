import { expect, test } from "./fixtures.js";

const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const baseUser = { _id: "user-voice", name: "Voice Candidate", email: "voice@example.com", role: "user", practicePlan: "free" };

const roundQuestion = { question: { _id: "question-voice", text: "Tell me about a production incident you handled." }, answerGiven: "", feedback: null };

const interviewPayload = ({ status = "in_progress", answer = "", feedback = null } = {}) => ({
    _id: "interview-voice",
    jobRole: "Backend Engineer",
    // Interviews in these scenarios already passed the one-time intro, so round 1 opens directly.
    candidateIntroAt: "2026-09-01T00:00:00.000Z",
    company: "Acme",
    rounds: [{
        round: {
            _id: "round-voice",
            name: "Behavioral deep dive",
            description: "Communication and ownership",
            deliveryMode: "conversational",
            status,
            questionLimit: 1,
            conversationalIndex: 0,
            questions: [{ ...roundQuestion, answerGiven: answer, feedback }],
        },
    }],
});

const mockAuth = async (page) => {
    await page.route("**/api/auth/refresh", (route) => json(route, { token: "test-access-token" }));
    await page.route("**/api/auth/profile", (route) => json(route, baseUser));
    await page.route("**/api/organizations", (route) => json(route, { organizations: [] }));
    await page.route("**/api/events", (route) => json(route, { accepted: true }, 202));
};

const openVoiceRound = async (page) => {
    await page.goto("/practice/interviews/interview-voice");
    await expect(page.getByRole("heading", { name: "Choose your next round" })).toBeVisible();
    await page.getByRole("button", { name: /Behavioral deep dive/i }).click();
};

const installReadyMedia = async (page) => {
    await page.addInitScript(() => {
        window.__spoken = [];
        class FakeRecognition {
            start() { this.onstart?.(); }
            stop() { this.__expectedStop = true; this.onend?.(); }
        }
        window.SpeechRecognition = FakeRecognition;
        window.webkitSpeechRecognition = FakeRecognition;
        window.speechSynthesis = {
            cancel() {},
            getVoices() { return []; },
            speak(utterance) {
                window.__spoken.push(utterance.text);
                setTimeout(() => utterance.onend?.(), 0);
            },
        };
        const stream = () => new MediaStream();
        Object.defineProperty(navigator, "mediaDevices", {
            configurable: true,
            value: {
                getUserMedia: async () => stream(),
                enumerateDevices: async () => [],
                addEventListener() {},
                removeEventListener() {},
            },
        });
        Object.defineProperty(navigator, "permissions", {
            configurable: true,
            value: { query: async () => ({ state: "granted", onchange: null }) },
        });
    });
};

const installBlockedMedia = async (page) => {
    await page.addInitScript(() => {
        window.__spoken = [];
        window.speechSynthesis = {
            cancel() {},
            getVoices() { return []; },
            speak(utterance) {
                window.__spoken.push(utterance.text);
                setTimeout(() => utterance.onend?.(), 0);
            },
        };
        Object.defineProperty(navigator, "mediaDevices", {
            configurable: true,
            value: {
                getUserMedia: () => new Promise(() => {}),
                enumerateDevices: async () => [],
                addEventListener() {},
                removeEventListener() {},
            },
        });
        Object.defineProperty(navigator, "permissions", {
            configurable: true,
            value: { query: async () => ({ state: "prompt", onchange: null }) },
        });
    });
};

test("mock interview requires mic and camera before revealing the first question", async ({ page }) => {
    await installBlockedMedia(page);
    await mockAuth(page);
    await page.route("**/api/interviews/interview-voice", (route) => json(route, interviewPayload()));

    await openVoiceRound(page);

    await expect(page.getByText("Before we start", { exact: true })).toBeVisible();
    await expect(page.getByText(/turn on your microphone and camera/i)).toBeVisible();
    await expect(page.getByText("Camera needed", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Turn on mic" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Turn on camera" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tell me about a production incident you handled." })).toHaveCount(0);
});

test("mock interview clarifications stay in the live stage with replay controls", async ({ page }) => {
    await installReadyMedia(page);
    await mockAuth(page);
    let clarificationRequest;
    await page.route("**/api/interviews/interview-voice", (route) => json(route, interviewPayload()));
    await page.route("**/api/questions/round-voice/clarify", async (route) => {
        clarificationRequest = await route.request().postDataJSON();
        return json(route, { answer: "Use one strong project example and explain the impact." });
    });

    await openVoiceRound(page);
    await expect(page.getByRole("heading", { name: "Tell me about a production incident you handled." })).toBeVisible();

    await page.getByPlaceholder("Need clarification? Ask the interviewer…").fill("Should I use a project example?");
    await page.getByRole("button", { name: "Ask" }).click();

    await expect.poll(() => clarificationRequest?.message).toBe("Should I use a project example?");
    await expect(page.getByText("Interviewer: Use one strong project example and explain the impact.")).toBeVisible();
    const replayClarification = page.getByRole("button", { name: "Play clarification again" });
    await expect(replayClarification).toBeVisible();
    await expect(replayClarification).toBeEnabled();
    await replayClarification.click();
});

test("mock interview refreshes completed-round feedback after the background job finishes", async ({ page }) => {
    await installReadyMedia(page);
    await mockAuth(page);
    let answerText = "";
    let completed = false;
    const feedback = { score: 8, comment: "Well structured answer with clear ownership.", suggestions: ["Add measurable impact"] };

    await page.route("**/api/interviews/interview-voice", (route) => json(route, interviewPayload({
        status: completed ? "completed" : "in_progress",
        answer: answerText,
        feedback: completed ? feedback : null,
    })));
    await page.route("**/api/questions/round-voice/answer", async (route) => {
        answerText = (await route.request().postDataJSON()).answer;
        return json(route, { done: false });
    });
    await page.route("**/api/jobs/bulk-feedback", (route) => json(route, { jobId: "feedback-job-1" }, 202));
    await page.route("**/api/jobs/status/bulk-feedback/feedback-job-1", (route) => json(route, { state: "completed", progress: 100 }));
    await page.route("**/api/questions/round-voice/complete", (route) => {
        completed = true;
        return json(route, { message: "Round complete" });
    });

    await openVoiceRound(page);
    await expect(page.getByRole("heading", { name: "Tell me about a production incident you handled." })).toBeVisible();
    await page.getByRole("button", { name: "Type / code" }).click();
    await page.getByPlaceholder("Answer by typing or speaking...").fill("I coordinated rollback, added alerts, and wrote the postmortem.");
    await page.getByRole("button", { name: "Submit now" }).click();
    await expect.poll(() => answerText).toContain("coordinated rollback");

    await page.getByRole("button", { name: "End round" }).click();
    await page.getByRole("button", { name: "End round" }).last().click();

    await expect(page.getByText("Round feedback", { exact: true })).toBeVisible();
    await expect(page.getByText("Well structured answer with clear ownership.")).toBeVisible();
    await expect(page.getByText(/Generating interview feedback/i)).toHaveCount(0);

    await page.getByRole("button", { name: "Back to rounds" }).click();
    await page.getByRole("link", { name: "View overall interview feedback" }).click();
    await expect(page.getByRole("heading", { name: "Overall interview feedback" })).toBeVisible();
    await expect(page.getByText("Well structured answer with clear ownership.")).toBeVisible();
});
