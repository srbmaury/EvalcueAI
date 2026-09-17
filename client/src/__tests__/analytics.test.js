import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { post } = vi.hoisted(() => ({ post: vi.fn().mockResolvedValue({}) }));
vi.mock("../api/axios", () => ({ default: { post } }));

const resetGaGlobals = () => {
    delete window.gtag;
    delete window.dataLayer;
    document.querySelectorAll('script[src*="googletagmanager.com"]').forEach((el) => el.remove());
};

describe("analytics", () => {
    beforeEach(() => { vi.resetModules(); resetGaGlobals(); post.mockClear(); });
    afterEach(() => { vi.unstubAllEnvs(); resetGaGlobals(); });

    it("trackEvent always posts to the internal /events endpoint", async () => {
        vi.stubEnv("VITE_GA_MEASUREMENT_ID", "");
        const { trackEvent } = await import("../utils/analytics.js");
        trackEvent("dashboard_viewed", "/practice/dashboard");
        expect(post).toHaveBeenCalledWith("/events", { event: "dashboard_viewed", path: "/practice/dashboard" });
    });

    it("initGoogleAnalytics does nothing without a measurement id", async () => {
        vi.stubEnv("VITE_GA_MEASUREMENT_ID", "");
        const { initGoogleAnalytics } = await import("../utils/analytics.js");
        initGoogleAnalytics();
        expect(window.gtag).toBeUndefined();
        expect(document.querySelector('script[src*="googletagmanager.com"]')).toBeNull();
    });

    it("does not load GA on localhost/dev unless explicitly opted in", async () => {
        vi.stubEnv("VITE_GA_MEASUREMENT_ID", "G-TEST123");
        vi.stubEnv("DEV", true);
        vi.stubEnv("VITE_GA_LOCAL_ENABLED", "false");
        const { initGoogleAnalytics } = await import("../utils/analytics.js");
        initGoogleAnalytics();
        expect(window.gtag).toBeUndefined();
    });

    it("loads gtag.js and configures it when a measurement id is set and local tracking is enabled", async () => {
        vi.stubEnv("VITE_GA_MEASUREMENT_ID", "G-TEST123");
        vi.stubEnv("DEV", true);
        vi.stubEnv("VITE_GA_LOCAL_ENABLED", "true");
        const { initGoogleAnalytics } = await import("../utils/analytics.js");
        initGoogleAnalytics();
        expect(typeof window.gtag).toBe("function");
        expect(window.dataLayer.length).toBeGreaterThan(0);
        const script = document.querySelector('script[src*="googletagmanager.com"]');
        expect(script?.src).toContain("G-TEST123");
    });

    it("trackEvent forwards to gtag as a custom event once GA is initialized", async () => {
        vi.stubEnv("VITE_GA_MEASUREMENT_ID", "G-TEST123");
        vi.stubEnv("DEV", true);
        vi.stubEnv("VITE_GA_LOCAL_ENABLED", "true");
        const { initGoogleAnalytics, trackEvent } = await import("../utils/analytics.js");
        initGoogleAnalytics();
        const spy = vi.spyOn(window, "gtag");
        trackEvent("resume_generation_completed", "/practice/resume-generate");
        expect(spy).toHaveBeenCalledWith("event", "resume_generation_completed", { page_path: "/practice/resume-generate" });
    });
});
