import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import WeeklyPlanSessionPage from "../WeeklyPlanSessionPage.jsx";

const mocks = vi.hoisted(() => ({ writeDraft: vi.fn() }));
vi.mock("../../utils/practiceCreateDraft", () => ({ writePracticeCreateDraft: (...args) => mocks.writeDraft(...args) }));

describe("WeeklyPlanSessionPage", () => {
    it("writes a prefilled interview draft and redirects to interview creation", async () => {
        render(
            <MemoryRouter initialEntries={["/practice/weekly-plan?role=Senior%20Backend%20Engineer&description=Practice%20distributed%20systems&session=2"]}>
                <Routes>
                    <Route path="/practice/weekly-plan" element={<WeeklyPlanSessionPage />} />
                    <Route path="/practice/new" element={<div>New interview</div>} />
                </Routes>
            </MemoryRouter>,
        );

        await waitFor(() => expect(mocks.writeDraft).toHaveBeenCalledWith(expect.objectContaining({
            formData: expect.objectContaining({
                jobRole: "Senior Backend Engineer",
                jobDescription: "Practice distributed systems",
            }),
            weeklyPlanSession: "2",
        })));
    });
});
