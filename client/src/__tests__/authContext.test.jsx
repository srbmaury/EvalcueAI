import { act, render, screen, waitFor } from "@testing-library/react";
import { useContext } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    del: vi.fn(),
    silentRefresh: vi.fn(),
    setAccessToken: vi.fn(),
    clearAccessToken: vi.fn(),
    adoptGuestWorkspacePreference: vi.fn(),
    clearWorkspacePreference: vi.fn(),
}));

vi.mock("../api/axios", () => ({
    default: { get: mocks.get, post: mocks.post, put: mocks.put, delete: mocks.del },
    silentRefresh: mocks.silentRefresh,
    setAccessToken: mocks.setAccessToken,
    clearAccessToken: mocks.clearAccessToken,
}));
vi.mock("../utils/workspacePreference", () => ({
    adoptGuestWorkspacePreference: mocks.adoptGuestWorkspacePreference,
    clearWorkspacePreference: mocks.clearWorkspacePreference,
}));

import { AuthContext, AuthProvider } from "../context/AuthContext";

let auth;
function Harness() {
    auth = useContext(AuthContext);
    return <div>{auth.loading ? "loading" : auth.user?.email || "signed-out"}</div>;
}

const renderAuth = () => render(<AuthProvider><Harness /></AuthProvider>);

describe("AuthProvider", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        auth = undefined;
        mocks.silentRefresh.mockResolvedValue({ token: "restored" });
        mocks.get.mockResolvedValue({ data: { _id: "user-1", email: "user@example.com" } });
    });

    it("restores a session and adopts the guest workspace preference", async () => {
        renderAuth();
        expect(screen.getByText("loading")).toBeTruthy();
        await screen.findByText("user@example.com");
        expect(mocks.silentRefresh).toHaveBeenCalledOnce();
        expect(mocks.get).toHaveBeenCalledWith("/auth/profile");
        expect(mocks.adoptGuestWorkspacePreference).toHaveBeenCalledWith("user-1");
    });

    it("settles signed out when refresh or profile restoration fails", async () => {
        mocks.silentRefresh.mockRejectedValue(new Error("expired"));
        renderAuth();
        await screen.findByText("signed-out");
        expect(mocks.get).not.toHaveBeenCalled();
    });

    it("supports local login, registration, Google login, and SSO exchange", async () => {
        renderAuth();
        await screen.findByText("user@example.com");
        mocks.post
            .mockResolvedValueOnce({ data: { token: "local-token" } })
            .mockResolvedValueOnce({ data: { created: true } })
            .mockResolvedValueOnce({ data: { token: "google-token" } })
            .mockResolvedValueOnce({ data: { redirectUrl: "https://idp.example" } })
            .mockResolvedValueOnce({ data: { token: "sso-token", organizationId: "org-1" } });

        await act(async () => {
            await auth.login("user@example.com", "secret", "captcha");
            expect(await auth.register("User", "user@example.com", "secret")).toEqual({ created: true });
            await auth.googleLogin("google-id-token");
            expect(await auth.startSsoLogin("user@example.com")).toEqual({ redirectUrl: "https://idp.example" });
            expect(await auth.completeSsoLogin("exchange-code")).toMatchObject({ organizationId: "org-1" });
        });

        expect(mocks.post).toHaveBeenNthCalledWith(1, "/auth/login", { email: "user@example.com", password: "secret", captchaToken: "captcha" });
        expect(mocks.post).toHaveBeenNthCalledWith(2, "/auth/register", { name: "User", email: "user@example.com", password: "secret" });
        expect(mocks.post).toHaveBeenNthCalledWith(3, "/auth/google", { idToken: "google-id-token" });
        expect(mocks.post).toHaveBeenNthCalledWith(4, "/sso/start", { email: "user@example.com" }, { skipAuthRedirect: true });
        expect(mocks.post).toHaveBeenNthCalledWith(5, "/sso/exchange", { exchangeCode: "exchange-code" }, { skipAuthRedirect: true });
        expect(mocks.setAccessToken.mock.calls.map(([token]) => token)).toEqual(["local-token", "google-token", "sso-token"]);
    });

    it("covers account recovery, profile updates, logout, and deletion", async () => {
        renderAuth();
        await screen.findByText("user@example.com");
        mocks.post.mockResolvedValue({ data: { ok: true } });
        mocks.put.mockResolvedValue({ data: { token: "updated-token", user: { _id: "user-1", email: "new@example.com" } } });
        mocks.del.mockResolvedValue({ data: { deleted: true } });

        await act(async () => {
            await auth.resendVerification("user@example.com");
            await auth.forgotPassword("user@example.com", "captcha");
            await auth.resetPassword({ token: "reset", email: "user@example.com", newPassword: "NewPassword1!", captchaToken: "captcha" });
            await auth.updateProfile({ name: "Updated" });
        });
        await waitFor(() => expect(screen.getByText("new@example.com")).toBeTruthy());
        expect(mocks.setAccessToken).toHaveBeenCalledWith("updated-token");

        mocks.post.mockRejectedValueOnce(new Error("network"));
        await act(async () => auth.logout());
        expect(mocks.clearAccessToken).toHaveBeenCalled();
        expect(screen.getByText("signed-out")).toBeTruthy();

        mocks.get.mockResolvedValueOnce({ data: { _id: "user-1", email: "user@example.com" } });
        await act(async () => auth.login("user@example.com", "secret"));
        await act(async () => auth.deleteAccount({ confirmation: "DELETE", password: "secret" }));
        expect(mocks.del).toHaveBeenCalledWith("/auth/profile", { data: { confirmation: "DELETE", password: "secret" } });
        expect(mocks.clearWorkspacePreference).toHaveBeenCalledWith("user-1");
    });
});
