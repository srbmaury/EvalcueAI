import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PricingPage from "../pages/PricingPage";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../api/axios", () => ({ default: { get, post: vi.fn() } }));
vi.mock("../utils/analytics", () => ({ trackEvent: vi.fn() }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Practice pricing", () => {
    it("shows only personal Free and Pro plans from Practice entitlements", async () => {
        get.mockResolvedValue({ data: {
            product: "practice",
            plan: "free",
            subscriptionStatus: "inactive",
            limits: { interviews: 3, resumeReviews: 10, resumeGenerations: 10 },
            used: { interviews: 0, resumeReviews: 0, resumeGenerations: 0 },
            planLimits: {
                free: { interviews: 3, resumeReviews: 10, resumeGenerations: 10 },
                pro: { interviews: 100, resumeReviews: 100, resumeGenerations: 100 },
            },
            prices: { pro: { unitAmount: 1000, currency: "usd", interval: "month", intervalCount: 1 } },
            billingAvailable: { pro: true },
        } });

        render(<MemoryRouter><PricingPage /></MemoryRouter>);

        expect(await screen.findByRole("heading", { name: "Choose your Practice plan" })).toBeTruthy();
        expect(screen.getByRole("heading", { name: "Free" })).toBeTruthy();
        expect(screen.getByRole("heading", { name: "Pro" })).toBeTruthy();
        expect(screen.queryByRole("heading", { name: "Scale" })).toBeNull();
        expect(screen.getByText("100 practice interviews each month")).toBeTruthy();
        expect(screen.getByText("100 resume reviews each month")).toBeTruthy();
        expect(screen.getByText("100 tailored resume generations each month")).toBeTruthy();
        expect(screen.queryByText(/candidate assessments each month/i)).toBeNull();
        expect(screen.queryByText(/Hiring teams|organization billing|candidate-interview capacity/i)).toBeNull();
        expect(screen.getByRole("button", { name: "Choose Pro" })).toBeTruthy();
        expect(get).toHaveBeenCalledWith("/billing/practice/entitlements");
    });
});
