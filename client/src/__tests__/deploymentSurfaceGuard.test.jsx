import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import DeploymentSurfaceGuard from "../components/DeploymentSurfaceGuard";

afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
});

const LocationProbe = () => {
    const location = useLocation();
    return <div>{location.pathname}</div>;
};

const renderAtRoot = () => render(
    <MemoryRouter initialEntries={["/"]}>
        <DeploymentSurfaceGuard>
            <LocationProbe />
        </DeploymentSurfaceGuard>
    </MemoryRouter>,
);

describe("DeploymentSurfaceGuard root routing", () => {
    it("renders the common landing root without redirecting to itself", () => {
        vi.stubEnv("VITE_APP_SURFACE", "landing");
        renderAtRoot();
        expect(screen.getByText("/")).toBeTruthy();
    });

    it("redirects a product-domain root to that product home", async () => {
        vi.stubEnv("VITE_APP_SURFACE", "practice");
        renderAtRoot();
        expect(await screen.findByText("/practice")).toBeTruthy();
    });
});
