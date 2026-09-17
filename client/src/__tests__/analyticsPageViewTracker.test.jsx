import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";
import AnalyticsPageViewTracker from "../components/AnalyticsPageViewTracker.jsx";

const { trackPageView } = vi.hoisted(() => ({ trackPageView: vi.fn() }));
vi.mock("../utils/analytics.js", () => ({ trackPageView }));

afterEach(() => { cleanup(); trackPageView.mockClear(); });

const Nav = ({ to }) => {
    const navigate = useNavigate();
    return <button onClick={() => navigate(to)}>go</button>;
};

describe("AnalyticsPageViewTracker", () => {
    it("fires a page_view for the initial route on mount", () => {
        render(
            <MemoryRouter initialEntries={["/practice/dashboard"]}>
                <AnalyticsPageViewTracker />
            </MemoryRouter>,
        );
        expect(trackPageView).toHaveBeenCalledWith("/practice/dashboard");
        expect(trackPageView).toHaveBeenCalledTimes(1);
    });

    it("fires again with the new path after a client-side navigation", () => {
        const { getByText } = render(
            <MemoryRouter initialEntries={["/practice/dashboard"]}>
                <AnalyticsPageViewTracker />
                <Routes>
                    <Route path="*" element={<Nav to="/practice/resume-generate" />} />
                </Routes>
            </MemoryRouter>,
        );
        trackPageView.mockClear();
        act(() => { getByText("go").click(); });
        expect(trackPageView).toHaveBeenCalledWith("/practice/resume-generate");
        expect(trackPageView).toHaveBeenCalledTimes(1);
    });
});
