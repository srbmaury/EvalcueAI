import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AssessmentsPage from "../pages/AssessmentsPage";
import { OrganizationContext } from "../context/OrganizationContext";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../api/axios", () => ({ default: { get } }));

const ownerOrganization = {
    activeOrganization: { _id: "org-1", name: "Acme", role: "owner" },
    currentRole: "owner",
    loading: false,
};

const renderAssessments = (entry = "/hire/assessments") => render(
    <OrganizationContext.Provider value={ownerOrganization}>
        <MemoryRouter initialEntries={[entry]}><AssessmentsPage /></MemoryRouter>
    </OrganizationContext.Provider>,
);

const emptyOverview = { summary: {}, assessments: [], candidates: [], totalPages: 1 };

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("assessment workspace hierarchy", () => {
    it("keeps creation as a link to the guided assessment builder", async () => {
        get.mockImplementation((url) => url === "/assessments/overview"
            ? Promise.resolve({ data: emptyOverview })
            : Promise.resolve({ data: { items: [{ _id: "a1", title: "Backend screen", jobRole: "Engineer", status: "active", attemptCount: 2, submittedCount: 1, shareToken: "share-token" }], totalPages: 1 } }));

        renderAssessments();

        expect(await screen.findByRole("heading", { name: "Backend screen" })).toBeTruthy();
        expect(screen.queryByRole("heading", { name: "Create assessment" })).toBeNull();
        expect(screen.getByRole("link", { name: "Create assessment" }).getAttribute("href")).toBe("/hire/assessments?create=1");
    });

    it("routes the empty-state create action to the same guided builder", async () => {
        get.mockImplementation((url) => url === "/assessments/overview"
            ? Promise.resolve({ data: emptyOverview })
            : Promise.resolve({ data: { items: [], totalPages: 1 } }));

        renderAssessments();

        expect(await screen.findByText("No assessments yet.")).toBeTruthy();
        expect(screen.getByRole("link", { name: "Create one" }).getAttribute("href")).toBe("/hire/assessments?create=1");
    });

    it("gives recruiters a cross-assessment candidate pipeline", async () => {
        get.mockImplementation((url) => url === "/assessments/overview"
            ? Promise.resolve({
                data: {
                    summary: { assessments: 3, activeAssessments: 2, totalCandidates: 5, submitted: 3, inProgress: 2, averageScore: 7.8 },
                    assessments: [{ _id: "a1", title: "Senior backend screen" }],
                    candidates: [{
                        _id: "c1",
                        candidateName: "Priya Singh",
                        candidateEmail: "priya@example.com",
                        status: "submitted",
                        overallScore: 8.4,
                        startedAt: "2026-08-10T10:00:00Z",
                        submittedAt: "2026-08-10T11:00:00Z",
                        assessment: { _id: "a1", title: "Senior backend screen", jobRole: "Backend Engineer" },
                    }],
                    totalPages: 1,
                },
            })
            : Promise.resolve({ data: { items: [], totalPages: 1 } }));

        renderAssessments();

        expect(await screen.findByRole("heading", { name: "Overview" })).toBeTruthy();
        expect(await screen.findByText("Priya Singh")).toBeTruthy();
        expect(screen.getByText("Senior backend screen")).toBeTruthy();
        expect(screen.getByRole("link", { name: "Review" }).getAttribute("href")).toBe("/hire/assessments/a1");
        expect(screen.getByText("3 submitted")).toBeTruthy();
    });
});
