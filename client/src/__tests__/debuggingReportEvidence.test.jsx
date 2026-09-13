import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AssessmentReportPage from "../pages/AssessmentReportPage";
import { NotificationProvider } from "../context/NotificationContext";
import { OrganizationContext } from "../context/OrganizationContext";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../api/axios", () => ({ default: { get, post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));

const renderReport = () => render(
    <OrganizationContext.Provider value={{ currentRole: "owner" }}>
        <NotificationProvider>
            <MemoryRouter initialEntries={["/hire/assessments/a1"]}>
                <Routes><Route path="/hire/assessments/:assessmentId" element={<AssessmentReportPage />} /></Routes>
            </MemoryRouter>
        </NotificationProvider>
    </OrganizationContext.Provider>,
);

const assessment = { _id: "a1", title: "Debug screen", status: "active", jobRole: "Backend Engineer", shareToken: "share", invitations: [], rubric: [] };

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("debugging report evidence", () => {
    it("shows deterministic code-fix results and changed paths", async () => {
        get.mockResolvedValue({ data: {
            assessment,
            attempts: [{
                _id: "c1", candidateName: "Candidate One", candidateEmail: "one@example.com", status: "submitted", startedAt: "2026-08-10T10:00:00Z", overallScore: 8,
                rounds: [{ _id: "round1", name: "Production debugging", deliveryMode: "debugging", score: 8, questions: [{ _id: "q1", text: "Fix duplicate processing", answer: "Submitted", score: 8, feedbackComment: "Good", suggestions: [] }] }],
                debuggingResponses: [{ roundIndex: 0, responseMode: "code_fix", finalEvaluation: { status: "failed", visiblePassed: 5, visibleTotal: 6, hiddenPassed: 4, hiddenTotal: 5, diff: { changed: 1, created: 1, deleted: 1, paths: ["src/payment.js", "src/idempotency.js", "src/legacy.js"] } }, submittedAt: "2026-08-10T10:30:00Z" }],
            }],
        } });
        renderReport();
        expect(await screen.findByRole("heading", { name: "Debug screen" })).toBeTruthy();
        expect(screen.getByText("Debugging assignment")).toBeTruthy();
        expect(screen.getByText("3 files changed")).toBeTruthy();
        expect(screen.getByText("Visible tests 5/6")).toBeTruthy();
        expect(screen.getByText("Hidden tests 4/5")).toBeTruthy();
        expect(screen.getByText("src/payment.js")).toBeTruthy();
        expect(screen.getByText("src/idempotency.js")).toBeTruthy();
        expect(screen.getByText("src/legacy.js")).toBeTruthy();
    });

    it("shows structured findings evidence", async () => {
        get.mockResolvedValue({ data: {
            assessment: { ...assessment, title: "Findings screen" },
            attempts: [{
                _id: "c2", candidateName: "Candidate Two", candidateEmail: "two@example.com", status: "submitted", startedAt: "2026-08-10T11:00:00Z", overallScore: 7,
                rounds: [{ _id: "round1", name: "Incident diagnosis", deliveryMode: "debugging", score: 7, questions: [{ _id: "q1", text: "Diagnose the concurrency defect", answer: "Submitted", score: 7, feedbackComment: "Good", suggestions: [] }] }],
                debuggingResponses: [{ roundIndex: 0, responseMode: "findings", findings: { rootCause: "A read-modify-write race permits duplicate processing.", evidence: "Two requests observe the same pending state.", proposedFix: "Use an idempotency key with an atomic conditional update.", impact: "The operation can execute more than once.", testingStrategy: "Run concurrent duplicate requests and assert one committed operation." }, finalEvaluation: { status: "submitted", findings: true }, submittedAt: "2026-08-10T11:25:00Z" }],
            }],
        } });
        renderReport();
        expect(await screen.findByRole("heading", { name: "Findings screen" })).toBeTruthy();
        expect(screen.getByText("Root cause")).toBeTruthy();
        expect(screen.getByText("A read-modify-write race permits duplicate processing.")).toBeTruthy();
        expect(screen.getByText("Evidence")).toBeTruthy();
        expect(screen.getByText("Two requests observe the same pending state.")).toBeTruthy();
        expect(screen.getByText("Proposed fix")).toBeTruthy();
        expect(screen.getByText("Impact / risk")).toBeTruthy();
        expect(screen.getByText("Testing strategy")).toBeTruthy();
    });
});
