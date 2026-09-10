import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DashboardPage from "../pages/DashboardPage";
import { AuthContext } from "../context/AuthContext";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../api/axios", () => ({ default: { get } }));
vi.mock("../utils/analytics", () => ({ trackEvent: vi.fn() }));

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe("Practice dashboard history filters", () => {
    it("keeps filters visible when a selected status has zero results", async () => {
        get.mockImplementation((url, config = {}) => {
            if (url === "/interviews/analytics/progress") return Promise.resolve({ data: { completed: 1, averageScore: 7, improvement: 0 } });
            if (url === "/recommendations") return Promise.resolve({ data: { actions: [] } });
            if (url === "/billing/practice/entitlements") return Promise.resolve({ data: {
                plan: "free",
                period: "2026-09",
                limits: { interviews: 3, resumeReviews: 3 },
                used: { interviews: 2, resumeReviews: 1 },
            } });
            if (url === "/resumes") return Promise.resolve({ data: { items: [], total: 1 } });
            if (url === "/interviews") {
                if (config?.params?.status === "completed") {
                    return Promise.resolve({ data: { items: [], total: 0, totalPages: 1 } });
                }
                return Promise.resolve({ data: {
                    items: [{ _id: "i-1", company: "Acme", jobRole: "Backend Engineer", createdAt: "2026-09-10T00:00:00.000Z", isCompleted: false, roundsCompleted: 0, roundsTotal: 1 }],
                    total: 1,
                    totalPages: 1,
                } });
            }
            return Promise.reject(new Error(`Unexpected GET ${url}`));
        });

        render(
            <MemoryRouter>
                <AuthContext.Provider value={{ user: { _id: "u-1", name: "Candidate", targetRole: "Backend Engineer" } }}>
                    <DashboardPage />
                </AuthContext.Provider>
            </MemoryRouter>,
        );

        const completedFilter = await screen.findByRole("button", { name: "Completed" });
        expect(screen.getByRole("button", { name: "All" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "In progress" })).toBeTruthy();
        expect(await screen.findByText(/used in September 2026/i)).toBeTruthy();
        expect(screen.queryByText(/Hiring capacity/i)).toBeNull();

        fireEvent.click(completedFilter);

        expect(await screen.findByRole("heading", { name: "No completed practice sessions" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "All" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "In progress" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Completed" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Show all sessions" })).toBeTruthy();

        await waitFor(() => {
            expect(get).toHaveBeenCalledWith("/interviews", { params: { page: 1, limit: 10, status: "completed" } });
        });
    });
});
