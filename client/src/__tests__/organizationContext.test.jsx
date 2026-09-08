import { act, render, screen, waitFor } from "@testing-library/react";
import { useContext } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../context/AuthContext";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), setOrganizationId: vi.fn() }));
vi.mock("../api/axios", () => ({
    default: { get: mocks.get, post: mocks.post },
    setOrganizationId: mocks.setOrganizationId,
}));

import { OrganizationContext, OrganizationProvider } from "../context/OrganizationContext";

let organizations;
function Harness() {
    organizations = useContext(OrganizationContext);
    return <div>{organizations.loading ? "loading" : organizations.activeOrganization?.name || organizations.error || "none"}</div>;
}

const renderOrganizations = (user = { _id: "user-1" }) => render(
    <AuthContext.Provider value={{ user }}>
        <OrganizationProvider><Harness /></OrganizationProvider>
    </AuthContext.Provider>,
);

describe("OrganizationProvider", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        organizations = undefined;
        window.localStorage.clear();
    });

    it("loads organizations and selects the first membership", async () => {
        mocks.get.mockResolvedValue({ data: { organizations: [{ _id: "org-1", name: "Acme", role: "owner" }] } });
        renderOrganizations();
        await screen.findByText("Acme");
        expect(mocks.get).toHaveBeenCalledWith("/organizations");
        expect(mocks.setOrganizationId).toHaveBeenNthCalledWith(1, null);
        expect(mocks.setOrganizationId).toHaveBeenLastCalledWith("org-1");
        expect(window.localStorage.getItem("evalcue:organization:user:user-1")).toBe("org-1");
        expect(organizations.currentRole).toBe("owner");
    });

    it("restores a preferred organization when it is still available", async () => {
        window.localStorage.setItem("evalcue:organization:user:user-1", "org-2");
        mocks.get.mockResolvedValue({ data: { organizations: [
            { _id: "org-1", name: "Acme", role: "owner" },
            { _id: "org-2", name: "Beta", role: "reviewer" },
        ] } });
        renderOrganizations();
        await screen.findByText("Beta");
        expect(organizations.currentRole).toBe("reviewer");
    });

    it("creates, selects, and manually switches organizations", async () => {
        mocks.get.mockResolvedValue({ data: { organizations: [] } });
        mocks.post.mockResolvedValue({ data: { organization: { _id: "org-new", name: "Newco", role: "owner" } } });
        renderOrganizations();
        await screen.findByText("none");

        await act(async () => organizations.createOrganization("Newco"));
        await waitFor(() => expect(screen.getByText("Newco")).toBeTruthy());
        expect(mocks.post).toHaveBeenCalledWith("/organizations", { name: "Newco" });
        expect(mocks.setOrganizationId).toHaveBeenLastCalledWith("org-new");

        act(() => organizations.selectOrganization(null));
        expect(mocks.setOrganizationId).toHaveBeenLastCalledWith(null);
        expect(window.localStorage.getItem("evalcue:organization:user:user-1")).toBeNull();
    });

    it("surfaces loading failures and clears stale organization scope", async () => {
        mocks.get.mockRejectedValue({ response: { data: { message: "Membership service unavailable" } } });
        renderOrganizations();
        await screen.findByText("Membership service unavailable");
        expect(organizations.organizations).toEqual([]);
        expect(organizations.activeOrganization).toBeNull();
        expect(mocks.setOrganizationId).toHaveBeenLastCalledWith(null);
    });

    it("does not request organizations for a signed-out visitor", async () => {
        renderOrganizations(null);
        await waitFor(() => expect(screen.getByText("none")).toBeTruthy());
        expect(mocks.get).not.toHaveBeenCalled();
        expect(mocks.setOrganizationId).toHaveBeenCalledWith(null);
    });

    it("rejects malformed create responses", async () => {
        mocks.get.mockResolvedValue({ data: { organizations: [] } });
        mocks.post.mockResolvedValue({ data: {} });
        renderOrganizations();
        await screen.findByText("none");
        await expect(organizations.createOrganization("Broken")).rejects.toThrow("Organization was not created");
    });
});
