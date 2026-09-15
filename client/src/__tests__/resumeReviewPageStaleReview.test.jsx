import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ResumeReviewPage from "../pages/ResumeReviewPage";
import { NotificationProvider } from "../context/NotificationContext";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../api/axios", () => ({ default: { get, post } }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("resume review stale-review guard", () => {
    it("clears a previous resume's AI review when the selected resume changes, so it isn't shown attributed to the newly-selected resume", async () => {
        get.mockResolvedValue({ data: [
            { _id: "r1", fileName: "Resume A.pdf", createdAt: "2026-09-01T00:00:00Z" },
            { _id: "r2", fileName: "Resume B.pdf", createdAt: "2026-09-02T00:00:00Z" },
        ] });
        post.mockResolvedValue({ data: { atsScore: 82, summary: "Strong fit for Resume A.", strengths: [], gaps: [], keywordsMatched: [], improvementSuggestions: [] } });

        render(<MemoryRouter><NotificationProvider><ResumeReviewPage /></NotificationProvider></MemoryRouter>);

        const chooseResume = async (label) => {
            fireEvent.mouseDown(await screen.findByRole("combobox", { name: "Choose resume" }));
            fireEvent.click(await screen.findByRole("option", { name: new RegExp(label) }));
        };

        await chooseResume("Resume A");
        fireEvent.click(await screen.findByRole("button", { name: "Generate AI review" }));
        expect(await screen.findByText(/Summary & ATS fit: 82%/)).toBeTruthy();

        await chooseResume("Resume B");

        expect(screen.queryByText(/Summary & ATS fit/)).toBeNull();
        expect(screen.queryByText("Strong fit for Resume A.")).toBeNull();
    });
});
