import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../context/AuthContext";
import { OrganizationContext } from "../context/OrganizationContext";

const mocks = vi.hoisted(() => ({
    toggle: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllRead: vi.fn(),
    setWorkspacePreference: vi.fn(),
    configuredSurface: vi.fn(() => null),
    deploymentRedirectUrl: vi.fn(() => null),
}));

vi.mock("../context/ThemeContext", () => ({ useThemeMode: () => ({ mode: "light", toggle: mocks.toggle }) }));
vi.mock("../context/NotificationContext", () => ({ useNotifications: () => ({
    notifications: [{ id: "notice-1", message: "Assessment submitted", href: "/practice/progress", read: false }],
    unreadCount: 1,
    markNotificationRead: mocks.markNotificationRead,
    markAllRead: mocks.markAllRead,
}) }));
vi.mock("../utils/workspacePreference", () => ({ setWorkspacePreference: mocks.setWorkspacePreference }));
vi.mock("../utils/deploymentSurface", () => ({
    configuredSurface: mocks.configuredSurface,
    deploymentRedirectUrl: mocks.deploymentRedirectUrl,
}));
vi.mock("../components/ProductFeedbackDialog", () => ({ default: ({ open }) => open ? <div>Feedback dialog open</div> : null }));

import ProductHeader from "../components/ProductHeader";

function LocationProbe() {
    const location = useLocation();
    return <output data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</output>;
}

const defaultOrganization = {
    organizations: [], activeOrganization: null, currentRole: null, selectOrganization: vi.fn(),
};

function renderHeader({ surface = "practice", user = null, loading = false, logout = vi.fn(), organization = defaultOrganization, path = "/practice/dashboard" } = {}) {
    return { logout, ...render(
        <AuthContext.Provider value={{ user, loading, logout }}>
            <OrganizationContext.Provider value={organization}>
                <MemoryRouter initialEntries={[path]}>
                    <ProductHeader surface={surface} />
                    <Routes><Route path="*" element={<LocationProbe />} /></Routes>
                </MemoryRouter>
            </OrganizationContext.Provider>
        </AuthContext.Provider>,
    ) };
}

describe("ProductHeader experience", () => {
    beforeEach(() => vi.clearAllMocks());

    it("shows product-specific public actions and switches products", () => {
        renderHeader({ path: "/practice" });
        expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/practice/login");
        expect(screen.getByRole("link", { name: "Start practicing" }).getAttribute("href")).toBe("/practice/register");
        fireEvent.click(screen.getByRole("button", { name: "Hire" }));
        expect(screen.getByTestId("location").textContent).toBe("/hire");
        expect(mocks.setWorkspacePreference).toHaveBeenCalledWith("hiring");
        fireEvent.click(screen.getByRole("button", { name: "Toggle theme" }));
        expect(mocks.toggle).toHaveBeenCalledOnce();
    });

    it("navigates authenticated Practice actions and notification links", async () => {
        const user = { _id: "user-1", name: "Alice Recruiter", email: "alice@example.com", role: "admin" };
        renderHeader({ user });
        expect(mocks.setWorkspacePreference).toHaveBeenCalledWith("practice", "user-1");
        fireEvent.click(screen.getByRole("button", { name: "New practice" }));
        expect(screen.getByTestId("location").textContent).toBe("/practice/new");

        fireEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
        const menu = await screen.findByRole("menu");
        fireEvent.click(within(menu).getByText("Mark read"));
        expect(mocks.markAllRead).toHaveBeenCalledOnce();
        fireEvent.click(within(menu).getByText("Assessment submitted"));
        expect(mocks.markNotificationRead).toHaveBeenCalledWith("notice-1");
        expect(screen.getByTestId("location").textContent).toBe("/practice/progress");
    });

    it("opens account actions, feedback, and signs out to the product home", async () => {
        const logout = vi.fn().mockResolvedValue(undefined);
        const user = { _id: "admin-1", name: "Admin User", email: "admin@example.com", role: "admin" };
        renderHeader({ user, logout, path: "/practice/profile" });
        fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
        let menu = await screen.findByRole("menu");
        expect(within(menu).getByText("Admin")).toBeTruthy();
        fireEvent.click(within(menu).getByText("Send feedback"));
        expect(await screen.findByText("Feedback dialog open")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
        menu = await screen.findByRole("menu");
        fireEvent.click(within(menu).getByText("Sign out"));
        await waitFor(() => expect(logout).toHaveBeenCalledOnce());
        await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/practice"));
    });

    it("applies hiring permissions and switches organizations", async () => {
        const selectOrganization = vi.fn();
        const organization = {
            organizations: [
                { _id: "org-1", name: "Acme", role: "owner" },
                { _id: "org-2", name: "Beta", role: "reviewer" },
            ],
            activeOrganization: { _id: "org-1", name: "Acme", role: "owner" },
            currentRole: "owner",
            selectOrganization,
        };
        renderHeader({ surface: "hiring", user: { _id: "user-1", name: "Owner", email: "owner@example.com" }, organization, path: "/hire/assessments" });
        expect(screen.getByRole("button", { name: "New assessment" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Team & billing" })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Acme" }));
        const menu = await screen.findByRole("menu");
        fireEvent.click(within(menu).getByText("Beta"));
        expect(selectOrganization).toHaveBeenCalledWith("org-2");
        expect(screen.getByTestId("location").textContent).toBe("/hire/assessments#candidate-pipeline");
    });

    it("offers setup instead of assessment creation when no hiring organization exists", () => {
        renderHeader({ surface: "hiring", user: { _id: "user-1", name: "New User" }, path: "/hire/team" });
        expect(screen.getByRole("button", { name: "Set up Hire" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "New assessment" })).toBeNull();
    });
});
