import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CandidateAssessmentPage from "../pages/CandidateAssessmentPage";

const { get, post, put } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock("../api/axios", () => ({ default: { get, post, put } }));

afterEach(() => { cleanup(); sessionStorage.clear(); localStorage.clear(); vi.clearAllMocks(); });

const renderCandidate = (entry = "/assessment/share-token-123456789") => {
    window.history.replaceState({}, "", entry);
    return render(
        <MemoryRouter initialEntries={[entry]}>
            <Routes><Route path="/assessment/:shareToken" element={<CandidateAssessmentPage />} /></Routes>
        </MemoryRouter>,
    );
};

const begin = async () => {
    fireEvent.change(await screen.findByLabelText(/Full name/), { target: { value: "Candidate" } });
    fireEvent.change(screen.getByLabelText(/Email address/), { target: { value: "candidate@example.com" } });
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Start assessment" }));
};

describe("candidate assessment interview UX", () => {
    it("shows expectations and consent without exposing private evaluation", async () => {
        get.mockResolvedValue({ data: {
            title: "Backend screen", organizationName: "Acme", jobRole: "Backend Engineer",
            durationMinutes: 45, followUpsEnabled: false, contactEmail: "help@example.com",
            rounds: [{ name: "Technical", description: "", deliveryMode: "conversational", questionCount: 2 }],
            overallScore: 9, feedbackComment: "This must never render",
        } });
        renderCandidate();
        expect(await screen.findByRole("heading", { name: "Backend screen" })).toBeTruthy();
        expect(screen.getByText(/2 questions · about 45 minutes/i)).toBeTruthy();
        expect(screen.getByText(/help@example.com/i)).toBeTruthy();
        expect(screen.queryByText("9/10")).toBeNull();
        expect(screen.queryByText("This must never render")).toBeNull();
        const start = screen.getByRole("button", { name: "Start assessment" });
        expect(start.disabled).toBe(true);
        fireEvent.click(screen.getByRole("checkbox"));
        await waitFor(() => expect(start.disabled).toBe(false));
    });

    it("prefills and locks invited candidate email", async () => {
        get.mockImplementation((url) => {
            if (url.includes("/invitation/")) return Promise.resolve({ data: { name: "Ada Candidate", email: "ada@example.com", emailLocked: true } });
            return Promise.resolve({ data: {
                title: "Invited screen", jobRole: "Engineer", durationMinutes: 30, followUpsEnabled: false,
                rounds: [{ name: "Technical", deliveryMode: "conversational", questionCount: 1 }],
            } });
        });
        renderCandidate("/assessment/share-token-123456789?invite=507f1f77bcf86cd799439011");
        expect(await screen.findByDisplayValue("Ada Candidate")).toBeTruthy();
        const email = screen.getByDisplayValue("ada@example.com");
        expect(email.disabled).toBe(true);
        expect(screen.getByText("Prefilled from your invitation")).toBeTruthy();
    });

    it("discloses local face monitoring before requiring integrity consent", async () => {
        get.mockResolvedValue({ data: {
            title: "Monitored screen", jobRole: "Engineer", durationMinutes: 30, followUpsEnabled: false,
            integrity: { enabled: true, requireCamera: true, monitorFacePresence: true, retentionDays: 14 },
            rounds: [{ name: "Technical", deliveryMode: "conversational", questionCount: 1 }],
        } });
        renderCandidate();
        expect(await screen.findByText(/camera frames stay in your browser and are not saved or uploaded/i)).toBeTruthy();
        expect(screen.getByText(/sustained face-presence/i)).toBeTruthy();
        expect(screen.getByRole("button", { name: "Check camera" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Start assessment" }).disabled).toBe(true);
    });

    it("requests fullscreen from the start-button user gesture", async () => {
        const requestFullscreen = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(document.documentElement, "requestFullscreen", { configurable: true, value: requestFullscreen });
        get.mockResolvedValue({ data: { title: "Fullscreen screen", jobRole: "Engineer", durationMinutes: 30, followUpsEnabled: false, integrity: { enabled: true, requireFullscreen: true, requireCamera: false, retentionDays: 14 }, rounds: [{ name: "Technical", deliveryMode: "conversational", questionCount: 1 }] } });
        post.mockResolvedValue({ data: { attemptToken: "token", attempt: { _id: "attempt", startedAt: new Date().toISOString(), rounds: [{ _id: "round", name: "Technical", deliveryMode: "conversational", adaptive: false, adaptiveComplete: true, questions: [{ _id: "question", text: "Explain your approach", answer: "" }] }] } } });
        renderCandidate();
        fireEvent.change(await screen.findByLabelText(/Full name/), { target: { value: "Candidate" } });
        fireEvent.change(screen.getByLabelText(/Email address/), { target: { value: "candidate@example.com" } });
        const consentBoxes = screen.getAllByRole("checkbox");
        fireEvent.click(consentBoxes[0]);
        fireEvent.click(consentBoxes[1]);
        fireEvent.click(screen.getByRole("button", { name: "Start assessment" }));
        expect(requestFullscreen).toHaveBeenCalledOnce();
        await waitFor(() => expect(post).toHaveBeenCalled());
        delete document.documentElement.requestFullscreen;
    });

    it("hides adaptive-engine mechanics and shows a target interview timer", async () => {
        get.mockResolvedValue({ data: {
            title: "Adaptive backend screen", jobRole: "Backend Engineer", durationMinutes: 30, followUpsEnabled: false,
            capabilities: { transcription: false, codeExecution: false },
            rounds: [{ name: "Technical", description: "Backend judgment", deliveryMode: "conversational", questionCount: 5 }],
        } });
        post.mockResolvedValue({ data: { attemptToken: "token", attempt: { _id: "attempt", startedAt: new Date().toISOString(), rounds: [{ _id: "round", name: "Technical", description: "Backend judgment", deliveryMode: "conversational", adaptive: true, maxQuestions: 5, adaptiveComplete: false, questions: [{ _id: "q1", text: "Tell me about a backend system you owned.", answer: "", followUpNumber: 0 }] }] } } });
        renderCandidate();
        await begin();
        expect(await screen.findByRole("heading", { name: "Tell me about a backend system you owned." })).toBeTruthy();
        expect(screen.getByText(/Target finish/)).toBeTruthy();
        expect(screen.queryByText("Adaptive")).toBeNull();
        expect(screen.queryByText(/up to 5 primary questions/i)).toBeNull();
        expect(screen.getByRole("button", { name: "I’m done" })).toBeTruthy();
    });

    it("keeps future rounds out of the active interview workspace", async () => {
        get.mockResolvedValue({ data: {
            title: "Sequential screen", jobRole: "Engineer", durationMinutes: 30, followUpsEnabled: false,
            capabilities: { transcription: false, codeExecution: false },
            rounds: [
                { name: "Technical", deliveryMode: "conversational", questionCount: 1 },
                { name: "System Design", deliveryMode: "system-design", questionCount: 1 },
            ],
        } });
        post.mockResolvedValue({ data: { attemptToken: "token", attempt: { _id: "attempt", startedAt: new Date().toISOString(), rounds: [
            { _id: "r1", name: "Technical", deliveryMode: "conversational", adaptive: false, adaptiveComplete: true, questions: [{ _id: "q1", text: "Explain a production incident.", answer: "" }] },
            { _id: "r2", name: "System Design", deliveryMode: "system-design", adaptiveComplete: true, questions: [{ _id: "q2", text: "Design a notification service.", answer: "" }] },
        ] } } });
        renderCandidate();
        await begin();
        expect(await screen.findByRole("heading", { name: "Explain a production incident." })).toBeTruthy();
        expect(screen.getByText("Technical", { exact: true })).toBeTruthy();
        expect(screen.queryByText("System Design", { exact: true })).toBeNull();
        expect(screen.queryByText("Interview plan", { exact: true })).toBeNull();
    });

    it("stays on the same primary question while the interviewer asks another follow-up", async () => {
        get.mockResolvedValue({ data: {
            title: "Adaptive backend screen", jobRole: "Backend Engineer", durationMinutes: 30, followUpsEnabled: true,
            capabilities: { transcription: false, codeExecution: false },
            rounds: [{ name: "Technical", description: "Backend judgment", deliveryMode: "conversational", questionCount: 3 }],
        } });
        const baseAttempt = {
            _id: "attempt", startedAt: new Date().toISOString(),
            rounds: [{ _id: "round", name: "Technical", description: "Backend judgment", deliveryMode: "conversational", adaptive: true, adaptiveComplete: false, questions: [{ _id: "q1", text: "How would you make an API resilient?", answer: "", followUps: [], followUpQuestion: "", followUpAnswer: "", followUpNumber: 0 }] }],
        };
        post.mockResolvedValue({ data: { attemptToken: "token", attempt: baseAttempt } });
        put
            .mockResolvedValueOnce({ data: { attempt: { ...baseAttempt, rounds: [{ ...baseAttempt.rounds[0], questions: [{ ...baseAttempt.rounds[0].questions[0], answer: "Use timeouts, retries, and idempotency.", followUps: [{ question: "How would you prevent retry storms?", answer: "" }], followUpQuestion: "How would you prevent retry storms?", followUpAnswer: "", followUpNumber: 1 }] }] } } })
            .mockResolvedValueOnce({ data: { attempt: { ...baseAttempt, rounds: [{ ...baseAttempt.rounds[0], questions: [{ ...baseAttempt.rounds[0].questions[0], answer: "Use timeouts, retries, and idempotency.", followUps: [{ question: "How would you prevent retry storms?", answer: "Backoff, jitter, retry budgets, and circuit breaking." }, { question: "How would you measure whether that policy is working?", answer: "" }], followUpQuestion: "How would you measure whether that policy is working?", followUpAnswer: "", followUpNumber: 2 }] }] } } });

        renderCandidate();
        await begin();
        const answer = await screen.findByPlaceholderText("Answer by typing or speaking...");
        fireEvent.change(answer, { target: { value: "Use timeouts, retries, and idempotency." } });
        fireEvent.click(screen.getByRole("button", { name: "I’m done" }));
        expect(await screen.findByRole("heading", { name: "How would you prevent retry storms?" })).toBeTruthy();
        expect(screen.getByText("Follow-up")).toBeTruthy();
        expect(screen.queryByText(/of up to 3/)).toBeNull();

        fireEvent.change(screen.getByPlaceholderText("Answer by typing or speaking..."), { target: { value: "Backoff, jitter, retry budgets, and circuit breaking." } });
        fireEvent.click(screen.getByRole("button", { name: "I’m done" }));
        expect(await screen.findByRole("heading", { name: "How would you measure whether that policy is working?" })).toBeTruthy();
        expect(put).toHaveBeenCalledTimes(2);
    });

    it("restores the exact active question after reload", async () => {
        get.mockResolvedValue({ data: {
            title: "Recovery screen", jobRole: "Engineer", durationMinutes: 20, followUpsEnabled: false,
            capabilities: { transcription: false, codeExecution: false },
            rounds: [{ name: "Reliability", deliveryMode: "conversational", questionCount: 2 }],
        } });
        const first = { _id: "q1", text: "How do you make deploys safe?", answer: "", followUpNumber: 0 };
        const second = { _id: "q2", text: "How do you validate rollback readiness?", answer: "", followUpNumber: 0 };
        const baseAttempt = { _id: "attempt", startedAt: new Date().toISOString(), rounds: [{ _id: "round", name: "Reliability", deliveryMode: "conversational", adaptive: false, adaptiveComplete: true, questions: [first, second] }] };
        post.mockResolvedValue({ data: { attemptToken: "token", attempt: baseAttempt } });
        put.mockResolvedValue({ data: { attempt: { ...baseAttempt, rounds: [{ ...baseAttempt.rounds[0], questions: [{ ...first, answer: "Canaries, health gates, and tested rollback." }, second] }] } } });

        const view = renderCandidate();
        await begin();
        fireEvent.change(await screen.findByPlaceholderText("Answer by typing or speaking..."), { target: { value: "Canaries, health gates, and tested rollback." } });
        fireEvent.click(screen.getByRole("button", { name: "I’m done" }));
        expect(await screen.findByRole("heading", { name: second.text })).toBeTruthy();

        view.unmount();
        renderCandidate();
        expect(await screen.findByRole("heading", { name: second.text })).toBeTruthy();
        expect(screen.queryByRole("heading", { name: first.text })).toBeNull();
        expect(post).toHaveBeenCalledTimes(1);
    });

    it("scopes the coding round's camera preview to its own sized slot instead of floating over the round footer", async () => {
        // WebcamPreview used to render as a direct child of the round-spanning Paper, so its
        // absolute bottom-right positioning floated over the ENTIRE round (problem statement,
        // workspace, and footer) instead of just the workspace column — covering and blocking
        // clicks on "Save and continue" at typical viewport heights. It must be scoped inside
        // a small dedicated slot, the same pattern Practice's OAForm already uses.
        get.mockResolvedValue({ data: {
            title: "Coding screen", jobRole: "Engineer", durationMinutes: 30, followUpsEnabled: false,
            capabilities: { transcription: false, codeExecution: false },
            rounds: [{ name: "Coding", deliveryMode: "online-assessment", questionCount: 1 }],
        } });
        const question = { _id: "q1", text: "Implement a rate limiter.", answer: "" };
        const baseAttempt = { _id: "attempt", startedAt: new Date().toISOString(), rounds: [{ _id: "round", name: "Coding", deliveryMode: "online-assessment", questions: [question] }] };
        post.mockResolvedValue({ data: { attemptToken: "token", attempt: baseAttempt } });

        renderCandidate();
        await begin();
        expect(await screen.findByRole("heading", { name: "Implement a rate limiter." })).toBeTruthy();

        // The dedicated slot must exist at all (its absence is exactly the regression: a bare
        // WebcamPreview positioned relative to the whole round instead of the workspace
        // column), and it must be nested inside the workspace column alongside the code
        // editor — not a sibling of the footer bar holding "Save and review round".
        const cameraSlot = screen.getByTestId("online-assessment-camera-slot");
        const workspaceHeading = screen.getByText("WORKSPACE");
        expect(workspaceHeading.parentElement.contains(cameraSlot)).toBe(true);
        const saveButton = screen.getByRole("button", { name: "Save and review round" });
        expect(workspaceHeading.parentElement.contains(saveButton)).toBe(false);
    });

    it("uses a soft conversational ending when a round finishes", async () => {
        get.mockResolvedValue({ data: {
            title: "One-round screen", jobRole: "Engineer", durationMinutes: 20, followUpsEnabled: false,
            capabilities: { transcription: false, codeExecution: false },
            rounds: [{ name: "Technical judgment", deliveryMode: "conversational", questionCount: 1 }],
        } });
        const question = { _id: "q1", text: "Tell me about a difficult engineering decision.", answer: "", followUpNumber: 0 };
        const baseAttempt = { _id: "attempt", startedAt: new Date().toISOString(), rounds: [{ _id: "round", name: "Technical judgment", deliveryMode: "conversational", adaptive: false, adaptiveComplete: true, questions: [question] }] };
        post.mockResolvedValue({ data: { attemptToken: "token", attempt: baseAttempt } });
        put.mockResolvedValue({ data: { attempt: { ...baseAttempt, rounds: [{ ...baseAttempt.rounds[0], questions: [{ ...question, answer: "I compared two designs and chose the simpler operational model." }] }] } } });

        renderCandidate();
        await begin();
        fireEvent.change(await screen.findByPlaceholderText("Answer by typing or speaking..."), { target: { value: "I compared two designs and chose the simpler operational model." } });
        fireEvent.click(screen.getByRole("button", { name: "I’m done" }));
        expect(await screen.findByRole("heading", { name: "Thanks — that wraps up Technical judgment." })).toBeTruthy();
        expect(screen.getByText(/That gives me what I need from the interview/)).toBeTruthy();
        expect(screen.getByRole("button", { name: "Review and submit" })).toBeTruthy();
    });
});
