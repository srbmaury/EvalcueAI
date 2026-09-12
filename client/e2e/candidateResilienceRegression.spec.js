import { expect, test } from "@playwright/test";

const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const mockSignedOut = async (page) => {
    await page.route("**/api/auth/refresh", (route) => json(route, { message: "Unauthenticated" }, 401));
};

const fillIdentity = async (page, { integrity = false } = {}) => {
    await page.getByLabel("Full name").fill("Candidate One");
    await page.getByLabel("Email address").fill("candidate@example.com");
    const checks = page.getByRole("checkbox");
    await checks.first().check();
    if (integrity) await checks.last().check();
};

const installFullscreenMedia = async (page) => {
    await page.addInitScript(() => {
        const stream = () => new MediaStream();
        Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
            getUserMedia: async () => stream(), enumerateDevices: async () => [], addEventListener() {}, removeEventListener() {},
        } });
        Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: async () => ({ state: "granted", onchange: null }) } });
        let fullscreenElement = null;
        Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fullscreenElement });
        Object.defineProperty(Element.prototype, "requestFullscreen", { configurable: true, value: async function requestFullscreen() {
            fullscreenElement = this;
            document.dispatchEvent(new Event("fullscreenchange"));
        } });
        document.exitFullscreen = async () => { fullscreenElement = null; document.dispatchEvent(new Event("fullscreenchange")); };
    });
};

const installServerTranscriptionOnly = async (page) => {
    await page.addInitScript(() => {
        delete window.SpeechRecognition;
        delete window.webkitSpeechRecognition;
        window.__recorders = [];
        class FakeMediaRecorder {
            constructor(stream) { this.stream = stream; this.state = "inactive"; window.__recorders.push(this); }
            start() { this.state = "recording"; }
            stop() {
                if (this.state === "inactive") return;
                this.state = "inactive";
                this.ondataavailable?.({ data: new Blob([new Uint8Array(1600)], { type: "audio/webm" }) });
                this.onstop?.();
            }
        }
        window.MediaRecorder = FakeMediaRecorder;
        const stream = () => new MediaStream();
        Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
            getUserMedia: async () => stream(), enumerateDevices: async () => [], addEventListener() {}, removeEventListener() {},
        } });
        Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: async () => ({ state: "granted", onchange: null }) } });
        window.speechSynthesis = { speaking: false, cancel() {}, getVoices() { return []; }, speak(utterance) { setTimeout(() => utterance.onend?.(), 0); } };
        window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    });
};

test("losing required fullscreen during an assessment blocks the workspace until fullscreen is restored", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Fullscreen behavior is desktop-only");
    await installFullscreenMedia(page);
    await mockSignedOut(page);
    const shareToken = "share-runtime-fullscreen";
    const question = "Explain a difficult production decision.";
    await page.route(`**/api/assessments/public/${shareToken}`, (route) => json(route, {
        title: "Integrity interview", organizationName: "Acme Hiring", jobRole: "Engineer", durationMinutes: 30,
        capabilities: { transcription: false, codeExecution: false },
        integrity: { enabled: true, requireCamera: false, requireFullscreen: true, trackFocus: true, trackClipboard: true, retentionDays: 30 },
        rounds: [{ name: "Interview", deliveryMode: "conversational", adaptive: false, questionCount: 1 }],
    }));
    await page.route(`**/api/assessments/public/${shareToken}/start`, (route) => json(route, {
        attemptToken: "attempt-secret",
        attempt: { _id: "attempt-1", startedAt: new Date().toISOString(), rounds: [{ _id: "r1", name: "Interview", deliveryMode: "conversational", questions: [{ _id: "q1", text: question, answer: "", followUps: [] }] }] },
    }, 201));
    await page.route(`**/api/assessments/public/${shareToken}/attempts/attempt-1/integrity-events`, (route) => json(route, { received: true }, 202));

    await page.goto(`/assessment/${shareToken}`);
    await fillIdentity(page, { integrity: true });
    await page.getByRole("button", { name: "Start assessment" }).click();
    await expect(page.getByRole("heading", { name: question })).toBeVisible();

    await page.evaluate(() => document.exitFullscreen());
    await expect(page.getByRole("heading", { name: "Restore required assessment conditions" })).toBeVisible();
    await expect(page.getByText("Fullscreen is required to continue this assessment.", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: question })).toHaveCount(0);

    await page.getByRole("button", { name: "Enter fullscreen" }).click();
    await expect(page.getByRole("heading", { name: question })).toBeVisible();
});

test("system-design voice falls back to protected server transcription when browser SpeechRecognition is unavailable", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "MediaRecorder fallback is desktop-only");
    await installServerTranscriptionOnly(page);
    await mockSignedOut(page);
    const shareToken = "share-server-stt-fallback";
    const question = "Design a durable job scheduler";
    let transcribeCalls = 0;
    let attemptHeader = "";

    await page.route(`**/api/assessments/public/${shareToken}`, (route) => json(route, {
        title: "System design interview", organizationName: "Acme Hiring", jobRole: "Backend Engineer", durationMinutes: 45,
        capabilities: { transcription: true, codeExecution: false }, integrity: { enabled: false },
        rounds: [{ name: "System design", deliveryMode: "system-design", adaptive: false, questionCount: 1 }],
    }));
    await page.route(`**/api/assessments/public/${shareToken}/start`, (route) => json(route, {
        attemptToken: "server-stt-secret",
        attempt: { _id: "attempt-stt", startedAt: new Date().toISOString(), rounds: [{ _id: "r1", name: "System design", deliveryMode: "system-design", questions: [{ _id: "q1", text: question, answer: "", diagramData: "", discussionTurns: [] }] }] },
    }, 201));
    await page.route(`**/api/assessments/public/${shareToken}/attempts/attempt-stt/transcribe`, (route) => {
        transcribeCalls += 1;
        attemptHeader = route.request().headers()["x-attempt-token"] || "";
        return json(route, { text: "Use durable queues, idempotent workers, leases, retries, and partitioned scheduling." });
    });

    await page.goto(`/assessment/${shareToken}`);
    await fillIdentity(page);
    await page.getByRole("button", { name: "Start assessment" }).click();
    await expect(page.getByText(question, { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__recorders.length)).toBeGreaterThan(0);

    await page.evaluate(() => window.__recorders[0].stop());
    await expect.poll(() => transcribeCalls).toBe(1);
    expect(attemptHeader).toBe("server-stt-secret");
    await expect(page.getByText("Use durable queues, idempotent workers, leases, retries, and partitioned scheduling.", { exact: true })).toBeVisible();
});

test("microphone denial leaves typing available and does not block a non-voice-required assessment", async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
            getUserMedia: async () => { throw new DOMException("Permission denied", "NotAllowedError"); }, enumerateDevices: async () => [], addEventListener() {}, removeEventListener() {},
        } });
        Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: async () => ({ state: "denied", onchange: null }) } });
    });
    await mockSignedOut(page);
    const shareToken = "share-mic-denied";
    await page.route(`**/api/assessments/public/${shareToken}`, (route) => json(route, {
        title: "Written-friendly interview", jobRole: "Engineer", durationMinutes: 20,
        capabilities: { transcription: false, codeExecution: false }, integrity: { enabled: false },
        rounds: [{ name: "Interview", deliveryMode: "conversational", adaptive: false, questionCount: 1 }],
    }));
    await page.route(`**/api/assessments/public/${shareToken}/start`, (route) => json(route, {
        attemptToken: "typing-secret",
        attempt: { _id: "attempt-type", startedAt: new Date().toISOString(), rounds: [{ _id: "r1", name: "Interview", deliveryMode: "conversational", questions: [{ _id: "q1", text: "Describe your approach.", answer: "", followUps: [] }] }] },
    }, 201));

    await page.goto(`/assessment/${shareToken}`);
    await page.getByRole("button", { name: "Check microphone" }).click();
    await expect(page.getByText("Microphone access is unavailable. You can still type your answers.", { exact: true })).toBeVisible();
    await fillIdentity(page);
    await page.getByRole("button", { name: "Start assessment" }).click();
    await expect(page.getByRole("heading", { name: "Describe your approach." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Type / code" })).toBeVisible();
});
