import { expect, test } from "@playwright/test";

const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const mockSignedOut = async (page) => {
    await page.route("**/api/auth/refresh", (route) => json(route, { message: "Unauthenticated" }, 401));
};

const installCandidateMedia = async (page, { fullscreenAllowed = true } = {}) => {
    await page.addInitScript(({ initialFullscreenAllowed }) => {
        window.__allowFullscreen = initialFullscreenAllowed;
        window.__recognitions = [];
        class FakeRecognition {
            constructor() { window.__recognitions.push(this); }
            start() { this.onstart?.(); }
            stop() { this.__expectedStop = true; this.onend?.(); }
        }
        window.SpeechRecognition = FakeRecognition;
        window.webkitSpeechRecognition = FakeRecognition;
        window.__emitCandidateSpeech = (text) => {
            const recognition = window.__recognitions.at(-1);
            if (!recognition?.onresult) return false;
            const result = [{ transcript: text }];
            result.isFinal = true;
            recognition.onresult({ resultIndex: 0, results: [result] });
            return true;
        };
        window.speechSynthesis = {
            speaking: false,
            cancel() { this.speaking = false; },
            getVoices() { return []; },
            speak(utterance) {
                this.speaking = true;
                setTimeout(() => { this.speaking = false; utterance.onend?.(); }, 0);
            },
        };
        window.SpeechSynthesisUtterance = class {
            constructor(text) { this.text = text; }
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
        let fullscreenElement = null;
        Object.defineProperty(document, "fullscreenElement", {
            configurable: true,
            get: () => fullscreenElement,
        });
        Object.defineProperty(Element.prototype, "requestFullscreen", {
            configurable: true,
            value: async function requestFullscreen() {
                if (!window.__allowFullscreen) throw new Error("fullscreen blocked");
                fullscreenElement = this;
                document.dispatchEvent(new Event("fullscreenchange"));
            },
        });
        document.exitFullscreen = async () => {
            fullscreenElement = null;
            document.dispatchEvent(new Event("fullscreenchange"));
        };
    }, { initialFullscreenAllowed: fullscreenAllowed });
};

const fillIdentityAndConsent = async (page, { integrity = false } = {}) => {
    await page.getByLabel("Full name").fill("Candidate One");
    await page.getByLabel("Email address").fill("candidate@example.com");
    const checkboxes = page.getByRole("checkbox");
    await checkboxes.first().check();
    if (integrity) await checkboxes.last().check();
};

test("shareable hiring link enforces camera and fullscreen before creating an attempt", async ({ page }) => {
    await installCandidateMedia(page, { fullscreenAllowed: false });
    await mockSignedOut(page);
    const shareToken = "share-integrity-generic-token-1234567890";
    let startCalls = 0;
    await page.route(`**/api/assessments/public/${shareToken}`, (route) => json(route, {
        title: "Integrity assessment",
        organizationName: "Acme Hiring",
        jobRole: "Engineer",
        durationMinutes: 30,
        timezone: "Asia/Kolkata",
        capabilities: { transcription: false, codeExecution: false },
        integrity: { enabled: true, requireCamera: true, requireFullscreen: true, trackFocus: true, trackClipboard: true, monitorFacePresence: false, retentionDays: 30 },
        rounds: [{ name: "Interview", deliveryMode: "conversational", adaptive: false, questionCount: 1 }],
    }));
    await page.route(`**/api/assessments/public/${shareToken}/start`, (route) => {
        startCalls += 1;
        return json(route, {
            attemptToken: "integrity-secret",
            attempt: { _id: "attempt-integrity", startedAt: new Date().toISOString(), rounds: [{ _id: "round-1", name: "Interview", deliveryMode: "conversational", questions: [{ _id: "q1", text: "Tell me about a decision.", answer: "", followUps: [] }] }] },
        }, 201);
    });

    await page.goto(`/assessment/${shareToken}`);
    await page.getByRole("button", { name: "Check camera" }).click();
    await expect(page.getByText("Camera ready", { exact: true })).toBeVisible();
    await fillIdentityAndConsent(page, { integrity: true });
    await page.getByRole("button", { name: "Start assessment" }).click();

    await expect.poll(() => startCalls).toBe(0);
    await expect(page.getByText("Fullscreen is required before this assessment can start.", { exact: true })).toBeVisible();

    await page.evaluate(() => { window.__allowFullscreen = true; });
    await page.getByRole("button", { name: "Start assessment" }).click();
    await expect.poll(() => startCalls).toBe(1);
    await expect(page.getByRole("heading", { name: "Tell me about a decision." })).toBeVisible();
});

test("recruiter-created system design round captures candidate speech", async ({ page }) => {
    await installCandidateMedia(page);
    await mockSignedOut(page);
    const shareToken = "share-system-design-voice-token-123456";
    const question = { _id: "q-system", text: "Design a URL shortener", answer: "", diagramData: "", discussionTurns: [] };
    await page.route(`**/api/assessments/public/${shareToken}`, (route) => json(route, {
        title: "System design interview",
        organizationName: "Acme Hiring",
        jobRole: "Backend Engineer",
        durationMinutes: 45,
        timezone: "Asia/Kolkata",
        capabilities: { transcription: true, codeExecution: false },
        integrity: { enabled: false },
        rounds: [{ name: "System design", deliveryMode: "system-design", adaptive: false, questionCount: 1 }],
    }));
    await page.route(`**/api/assessments/public/${shareToken}/start`, (route) => json(route, {
        attemptToken: "voice-secret",
        attempt: {
            _id: "attempt-system",
            startedAt: new Date().toISOString(),
            rounds: [{ _id: "round-system", name: "System design", deliveryMode: "system-design", questions: [question] }],
        },
    }, 201));

    await page.goto(`/assessment/${shareToken}`);
    await fillIdentityAndConsent(page);
    await page.getByRole("button", { name: "Start assessment" }).click();
    await expect(page.getByText("Design a URL shortener", { exact: true })).toBeVisible();
    await expect(page.getByLabel(/Listening|Microphone idle/)).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__recognitions.length)).toBeGreaterThan(0);

    const emitted = await page.evaluate(() => window.__emitCandidateSpeech("I would use a key value store with caching and partitioning"));
    expect(emitted).toBe(true);
    await expect(page.getByText("I would use a key value store with caching and partitioning", { exact: true })).toBeVisible();
});
