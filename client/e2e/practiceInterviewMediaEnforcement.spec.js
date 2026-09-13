import { expect, test } from "@playwright/test";

const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const baseUser = { _id: "user-media", name: "Media Candidate", email: "media@example.com", role: "user", practicePlan: "free" };

const roundQuestion = (id, text) => ({ question: { _id: id, text }, answerGiven: "", feedback: null });

const interviewPayload = ({ name, description, deliveryMode, question }) => ({
    _id: "interview-media",
    jobRole: "Software Engineer",
    company: "Acme",
    rounds: [{
        round: {
            _id: "round-media",
            name,
            description,
            deliveryMode,
            status: "in_progress",
            questionLimit: 1,
            conversationalIndex: 0,
            questions: [question],
        },
    }],
});

const mockAuth = async (page) => {
    await page.route("**/api/auth/refresh", (route) => json(route, { token: "test-access-token" }));
    await page.route("**/api/auth/profile", (route) => json(route, baseUser));
    await page.route("**/api/organizations", (route) => json(route, { organizations: [] }));
    await page.route("**/api/events", (route) => json(route, { accepted: true }, 202));
};

const installMedia = async (page, { completeSpeech = true, speechStartDelay = 0, speechDuration = 150 } = {}) => {
    await page.addInitScript(({ completeSpeech, speechStartDelay, speechDuration }) => {
        window.__spoken = [];
        window.__mediaRequests = [];
        window.__recognitionActive = false;
        window.__micSpeechOverlap = false;

        class FakeRecognition {
            start() { window.__recognitionActive = true; this.onstart?.(); }
            stop() { window.__recognitionActive = false; this.__expectedStop = true; this.onend?.(); }
        }
        window.SpeechRecognition = FakeRecognition;
        window.webkitSpeechRecognition = FakeRecognition;

        let paused = true;
        Object.defineProperty(window, "speechSynthesis", {
            configurable: true,
            value: {
                speaking: false,
                cancel() { this.speaking = false; },
                resume() { paused = false; },
                getVoices() { return []; },
                speak(utterance) {
                    if (paused) return;
                    window.__spoken.push(utterance.text);
                    setTimeout(() => {
                        this.speaking = true;
                        if (window.__recognitionActive) window.__micSpeechOverlap = true;
                        setTimeout(() => {
                            this.speaking = false;
                            if (completeSpeech) utterance.onend?.();
                        }, speechDuration);
                    }, speechStartDelay);
                },
            },
        });

        const stream = () => new MediaStream();
        Object.defineProperty(navigator, "mediaDevices", {
            configurable: true,
            value: {
                getUserMedia: async (constraints) => {
                    window.__mediaRequests.push(constraints);
                    return stream();
                },
                enumerateDevices: async () => [],
                addEventListener() {},
                removeEventListener() {},
            },
        });
        Object.defineProperty(navigator, "permissions", {
            configurable: true,
            value: { query: async () => ({ state: "granted", onchange: null }) },
        });
    }, { completeSpeech, speechStartDelay, speechDuration });
};

const openRound = async (page, payload) => {
    await mockAuth(page);
    await page.route("**/api/interviews/interview-media", (route) => json(route, payload));
    await page.goto("/practice/interviews/interview-media");
    await page.getByRole("button", { name: new RegExp(payload.rounds[0].round.name, "i") }).click();
};

const expectRequiredCameraAndMic = async (page) => {
    await expect.poll(async () => page.evaluate(() => window.__mediaRequests.some((item) => Boolean(item?.video)))).toBe(true);
    await expect.poll(async () => page.evaluate(() => window.__mediaRequests.some((item) => Boolean(item?.audio)))).toBe(true);
    await expect(page.getByText("Required", { exact: true })).toBeVisible();
};

test("practice conversational round auto-speaks and enforces always-on camera plus microphone", async ({ page }) => {
    await installMedia(page);
    const question = "Tell me about a production incident you handled.";
    await openRound(page, interviewPayload({
        name: "Behavioral deep dive",
        description: "Communication and ownership",
        deliveryMode: "conversational",
        question: roundQuestion("question-conv", question),
    }));

    await expectRequiredCameraAndMic(page);
    await expect.poll(async () => page.evaluate((text) => window.__spoken.some((item) => item.includes(text)), question)).toBe(true);
});

test("practice coding round keeps the microphone hands-free, speaks each problem, and requires camera", async ({ page }) => {
    await installMedia(page);
    const question = "Implement an LRU cache with O(1) get and put.";
    await openRound(page, interviewPayload({
        name: "Coding round",
        description: "Data structures and algorithms",
        deliveryMode: "online-assessment",
        question: roundQuestion("question-code", question),
    }));

    await expectRequiredCameraAndMic(page);
    await expect.poll(async () => page.evaluate((text) => window.__spoken.some((item) => item.includes(text)), question)).toBe(true);
    await expect(page.getByText(/Interview mic active|Listening/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Answer with voice|Start voice/i })).toHaveCount(0);
    await expect.poll(async () => page.evaluate(() => window.__spoken[0])).toContain("Hi, welcome to the Coding round");
    const cameraBox = await page.getByLabel("Your camera preview").boundingBox();
    const skipBox = await page.getByRole("button", { name: "Skip round" }).boundingBox();
    expect(cameraBox && skipBox).toBeTruthy();
    expect(
        cameraBox.x + cameraBox.width <= skipBox.x
        || skipBox.x + skipBox.width <= cameraBox.x
        || cameraBox.y + cameraBox.height <= skipBox.y
        || skipBox.y + skipBox.height <= cameraBox.y,
    ).toBe(true);
});

test("practice coding round resumes the microphone when browser speech completion is missing", async ({ page }) => {
    await installMedia(page, { completeSpeech: false, speechStartDelay: 900, speechDuration: 350 });
    const question = "Explain how you would detect a cycle in a linked list.";
    await openRound(page, interviewPayload({
        name: "Data Structures and Algorithms",
        description: "Timed coding challenges",
        deliveryMode: "online-assessment",
        question: roundQuestion("question-timeout", question),
    }));

    await expect.poll(async () => page.evaluate((text) => window.__spoken.some((item) => item.includes(text)), question)).toBe(true);
    await expect(page.getByText("Listening", { exact: true })).toBeVisible({ timeout: 7000 });
    await expect.poll(async () => page.evaluate(() => window.__micSpeechOverlap)).toBe(false);
});

test("practice system-design round auto-speaks and keeps required face-monitored camera active", async ({ page }) => {
    await installMedia(page);
    const question = "Design a globally distributed URL shortener.";
    await openRound(page, interviewPayload({
        name: "System Design",
        description: "Architecture and scalability",
        deliveryMode: "conversational",
        question: roundQuestion("question-system", question),
    }));

    await expectRequiredCameraAndMic(page);
    await expect.poll(async () => page.evaluate((text) => window.__spoken.some((item) => item.includes(text)), question)).toBe(true);
    await expect(page.getByText("Conversation", { exact: true })).toBeVisible();
});
