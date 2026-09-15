import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import AssessmentPreviewPage from "../pages/AssessmentPreviewPage";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../api/axios", () => ({ default: { get } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("assessment candidate preview", () => {
    it("shows candidate-facing setup and allows reviewing every question without starting an attempt", async () => {
        get.mockResolvedValue({ data: { title: "Backend screen", company: "Acme", jobRole: "Backend Engineer", durationMinutes: 30, inviteOnly: true, followUpsEnabled: true, candidateInstructions: "Use a quiet room.", integrity: { enabled: true, requireCamera: true, requireFullscreen: true }, rounds: [{ name: "Technical", deliveryMode: "conversational", questions: [{ text: "Design an API." }, { text: "Secure the API." }] }] } });
        render(<MemoryRouter initialEntries={["/hire/assessments/a1/preview"]}><Routes><Route path="/hire/assessments/:assessmentId/preview" element={<AssessmentPreviewPage />} /></Routes></MemoryRouter>);

        expect(await screen.findByRole("heading", { name: "Backend screen" })).toBeTruthy();
        expect(screen.getByText(/Nothing entered here is saved/)).toBeTruthy();
        expect(screen.getByText("Camera required")).toBeTruthy();
        expect(screen.getByRole("heading", { name: "Design an API." })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Next question" }));
        expect(screen.getByRole("heading", { name: "Secure the API." })).toBeTruthy();
        expect(get).toHaveBeenCalledWith("/assessments/a1/preview");
    });

    it("resets the round/question position when navigating to a different assessment with fewer rounds, instead of crashing on an out-of-range index", async () => {
        const bigAssessment = { title: "Backend screen", jobRole: "Backend Engineer", rounds: [
            { name: "Round 1", deliveryMode: "conversational", questions: [{ text: "Q1a" }, { text: "Q1b" }] },
            { name: "Round 2", deliveryMode: "conversational", questions: [{ text: "Q2a" }] },
        ] };
        const smallAssessment = { title: "Frontend screen", jobRole: "Frontend Engineer", rounds: [
            { name: "Only round", deliveryMode: "conversational", questions: [{ text: "Solo question" }] },
        ] };
        get.mockImplementation((url) => Promise.resolve({ data: url.includes("/a1/") ? bigAssessment : smallAssessment }));

        render(
            <MemoryRouter initialEntries={["/hire/assessments/a1/preview"]}>
                <Routes>
                    <Route path="/hire/assessments/:assessmentId/preview" element={<>
                        <Link to="/hire/assessments/a2/preview">Switch assessment</Link>
                        <AssessmentPreviewPage />
                    </>} />
                </Routes>
            </MemoryRouter>,
        );

        // Advance into round 2 of the bigger assessment before switching away.
        expect(await screen.findByRole("heading", { name: "Q1a" })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Next question" }));
        fireEvent.click(screen.getByRole("button", { name: "Next question" }));
        expect(screen.getByRole("heading", { name: "Q2a" })).toBeTruthy();

        fireEvent.click(screen.getByText("Switch assessment"));

        expect(await screen.findByRole("heading", { name: "Solo question" })).toBeTruthy();
    });
});
