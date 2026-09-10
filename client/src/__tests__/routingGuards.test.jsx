import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import ProtectedRoute from "../components/ProtectedRoute";
import AdminRoute from "../components/AdminRoute";
import GuestOnlyRoute from "../components/GuestOnlyRoute";

afterEach(cleanup);

const renderRoutes = (auth, initial = "/private") => render(
    <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[initial]}>
            <Routes>
                <Route path="/login" element={<div>Login screen</div>} />
                <Route path="/practice/login" element={<div>Practice login</div>} />
                <Route path="/hire/login" element={<div>Hire login</div>} />
                <Route path="/practice/dashboard" element={<div>Dashboard screen</div>} />
                <Route path="/private" element={<ProtectedRoute><div>Private screen</div></ProtectedRoute>} />
                <Route path="/practice/private" element={<ProtectedRoute><div>Practice private</div></ProtectedRoute>} />
                <Route path="/hire/private" element={<ProtectedRoute><div>Hire private</div></ProtectedRoute>} />
                <Route path="/guest" element={<GuestOnlyRoute><div>Guest screen</div></GuestOnlyRoute>} />
                <Route path="/admin" element={<ProtectedRoute><AdminRoute><div>Admin screen</div></AdminRoute></ProtectedRoute>} />
            </Routes>
        </MemoryRouter>
    </AuthContext.Provider>,
);

describe("route authorization guards", () => {
    it("redirects a signed-out user to generic login outside a product surface", () => {
        renderRoutes({ user: null, loading: false });
        expect(screen.getByText("Login screen")).toBeTruthy();
        expect(screen.queryByText("Private screen")).toBeNull();
    });

    it("redirects practice and hiring URLs to their own login experiences", () => {
        const practice = renderRoutes({ user: null, loading: false }, "/practice/private");
        expect(screen.getByText("Practice login")).toBeTruthy();
        practice.unmount();

        renderRoutes({ user: null, loading: false }, "/hire/private");
        expect(screen.getByText("Hire login")).toBeTruthy();
    });

    it("allows an authenticated user to access protected content", () => {
        renderRoutes({ user: { _id: "user-1", role: "user" }, loading: false });
        expect(screen.getByText("Private screen")).toBeTruthy();
    });

    it("redirects a non-admin away from admin content", () => {
        renderRoutes({ user: { _id: "user-1", role: "user" }, loading: false }, "/admin");
        expect(screen.getByText("Dashboard screen")).toBeTruthy();
        expect(screen.queryByText("Admin screen")).toBeNull();
    });

    it("allows an admin to access admin content", () => {
        renderRoutes({ user: { _id: "admin-1", role: "admin" }, loading: false }, "/admin");
        expect(screen.getByText("Admin screen")).toBeTruthy();
    });

    it("redirects authenticated users away from guest-only routes", () => {
        renderRoutes({ user: { _id: "user-1", role: "user" }, loading: false }, "/guest");
        expect(screen.getByText("Dashboard screen")).toBeTruthy();
        expect(screen.queryByText("Guest screen")).toBeNull();
    });

    it("allows signed-out users to access guest-only routes", () => {
        renderRoutes({ user: null, loading: false }, "/guest");
        expect(screen.getByText("Guest screen")).toBeTruthy();
    });

    it("renders guest-only content while session restoration is still loading", () => {
        renderRoutes({ user: null, loading: true }, "/guest");
        expect(screen.getByText("Guest screen")).toBeTruthy();
    });
});
