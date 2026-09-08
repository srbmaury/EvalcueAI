import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import PracticeLimitDialog from "../components/PracticeLimitDialog";

describe("PracticeLimitDialog", () => {
    it("explains a reached allowance and links to Practice plans", () => {
        render(
            <MemoryRouter>
                <PracticeLimitDialog
                    limit={{
                        metric: "interviews",
                        limit: 3,
                        message: "You’ve used all 3 practice interviews included in your Practice Free plan this month.",
                    }}
                    onClose={vi.fn()}
                />
            </MemoryRouter>,
        );

        expect(screen.getByRole("heading", { name: "You’ve reached this month’s free allowance" })).toBeTruthy();
        expect(screen.getByText(/used all 3 practice interviews/i)).toBeTruthy();
        expect(screen.getByRole("link", { name: "View Practice plans" }).getAttribute("href")).toBe("/practice/pricing");
    });
});
