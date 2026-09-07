import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import api from "../api/axios";
import BillingSuccessPage from "../pages/BillingSuccessPage";

vi.mock("../api/axios", () => ({ default: { get: vi.fn() } }));

describe("BillingSuccessPage", () => {
    it("recognizes Hiring Growth checkout for the selected organization", async () => {
        api.get.mockResolvedValue({ data: { plan: "growth" } });
        render(<MemoryRouter initialEntries={["/billing/success?product=hiring&organizationId=org-1"]}><BillingSuccessPage /></MemoryRouter>);
        expect(await screen.findByText("Growth Hiring is active for this organization.")).toBeTruthy();
        expect(screen.getByRole("link", { name: "Continue to Hiring" }).getAttribute("href")).toBe("/hire/team");
        expect(api.get).toHaveBeenCalledWith("/billing/hiring/entitlements", { headers: { "X-Organization-Id": "org-1" } });
    });

    it("recognizes personal Practice Pro checkout", async () => {
        api.get.mockResolvedValue({ data: { plan: "pro" } });
        render(<MemoryRouter initialEntries={["/billing/success?product=practice"]}><BillingSuccessPage /></MemoryRouter>);
        expect(await screen.findByText("Practice Pro is active on your account.")).toBeTruthy();
        expect(screen.getByRole("link", { name: "Continue to Practice" }).getAttribute("href")).toBe("/practice/dashboard");
    });
});
