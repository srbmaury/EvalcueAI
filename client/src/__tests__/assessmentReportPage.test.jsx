import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AssessmentReportPage from "../pages/AssessmentReportPage";
import { NotificationProvider } from "../context/NotificationContext";
import { OrganizationContext } from "../context/OrganizationContext";

const { get, post, patch } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock("../api/axios", () => ({ default: { get, post, patch, delete: vi.fn() } }));

const renderOwnerReport = () => render(
    <OrganizationContext.Provider value={{ currentRole: "owner" }}>
        <NotificationProvider>
            <MemoryRouter initialEntries={["/hire/assessments/a1"]}>
                <Routes><Route path="/hire/assessments/:assessmentId" element={<AssessmentReportPage />} /></Routes>
            </MemoryRouter>
        </NotificationProvider>
    </OrganizationContext.Provider>,
);

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("assessment management report", () => {
    it("renders management, invitations, scorecard, and complete follow-up evidence", async () => {
        get.mockResolvedValue({ data: {
            assessment: { _id: "a1", title: "Backend screen", status: "active", jobRole: "Backend Engineer", shareToken: "share", invitations: [{ _id: "i1", email: "candidate@example.com", status: "completed" }], rubric: [{ _id: "r1", name: "Technical judgment", weight: 2 }] },
            attempts: [{ _id: "c1", candidateName: "Candidate One", candidateEmail: "candidate@example.com", status: "submitted", startedAt: "2026-08-10T10:00:00Z", overallScore: 8, integrityEvents: [{ type: "tab_hidden" }], rounds: [{ _id: "round1", name: "Technical", score: 8, questions: [{ _id: "q1", text: "Design a secure API", answer: "Use scoped authentication.", score: 8, feedbackComment: "Good evidence", suggestions: [], followUps: [{ question: "How do you rotate credentials?", answer: "Use short-lived credentials and automated rotation." }, { question: "How do you detect abuse?", answer: "Rate limits, anomaly signals, and audit logs." }] }] }] }],
        } });
        renderOwnerReport();
        expect(await screen.findByRole("heading", { name: "Backend screen" })).toBeTruthy();
        expect(screen.getByRole("heading", { name: "Invite candidates" })).toBeTruthy();
        expect(screen.getByRole("heading", { name: "Shared scorecard" })).toBeTruthy();
        expect(screen.getByText(/Integrity review/)).toBeTruthy();
        expect(screen.getByText("Human scorecard")).toBeTruthy();
        expect(screen.getByText(/AI follow-up 1: How do you rotate credentials/)).toBeTruthy();
        expect(screen.getByText(/AI follow-up 2: How do you detect abuse/)).toBeTruthy();
        expect(screen.getByRole("link", { name: "Preview candidate experience" }).getAttribute("href")).toBe("/hire/assessments/a1/preview");
    });

    it("confirms version creation and redirects to the canonical Hire assessment", async () => {
        get.mockResolvedValue({ data: { assessment: { _id: "a1", title: "Backend screen", status: "active", jobRole: "Engineer", shareToken: "share", invitations: [], rubric: [] }, attempts: [] } });
        post.mockResolvedValue({ data: { _id: "a2", title: "Backend screen · v2" } });
        renderOwnerReport();
        fireEvent.click(await screen.findByRole("button", { name: "Create new version" }));
        await waitFor(() => expect(post).toHaveBeenCalledWith("/assessments/a1/duplicate", {}));
        expect(await screen.findByText("New version “Backend screen · v2” created successfully.")).toBeTruthy();
        await waitFor(() => expect(get).toHaveBeenCalledWith("/assessments/a2"));
        expect(window.location.pathname).not.toBe("/assessments/a2");
    });

    it("clears the local reviewer draft after saving, so a later reload's server value isn't permanently shadowed by the stale local edit", async () => {
        const baseAttempt = { _id: "c1", candidateName: "Candidate One", candidateEmail: "candidate@example.com", status: "submitted", startedAt: "2026-08-10T10:00:00Z", overallScore: 8, integrityEvents: [], rounds: [{ _id: "round1", name: "Technical", score: 8, questions: [{ _id: "q1", text: "Design a secure API", answer: "Use scoped authentication.", score: 8, feedbackComment: "Good evidence", suggestions: [] }] }] };
        const assessment = { _id: "a1", title: "Backend screen", status: "active", jobRole: "Backend Engineer", shareToken: "share", invitations: [], rubric: [] };
        get.mockResolvedValueOnce({ data: { assessment, attempts: [{ ...baseAttempt, reviewerScore: 0 }] } });
        patch.mockResolvedValue({ data: {} });
        renderOwnerReport();

        expect(await screen.findByRole("heading", { name: "Backend screen" })).toBeTruthy();
        const scoreField = screen.getByLabelText("Overall reviewer score / 10");
        fireEvent.change(scoreField, { target: { value: "9" } });
        expect(scoreField.value).toBe("9");

        // A colleague's review (with a different score) is now the server truth by the
        // time this save's reload completes.
        get.mockResolvedValueOnce({ data: { assessment, attempts: [{ ...baseAttempt, reviewerScore: 6, reviewerDecision: "hold" }] } });
        fireEvent.click(screen.getByRole("button", { name: "Save review" }));
        await waitFor(() => expect(patch).toHaveBeenCalledWith("/assessments/a1/attempts/c1/review", expect.objectContaining({ reviewerScore: "9" })));

        await waitFor(() => expect(screen.getByLabelText("Overall reviewer score / 10").value).toBe("6"));
    });
});
