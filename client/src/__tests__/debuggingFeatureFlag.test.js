import { afterEach, describe, expect, it, vi } from "vitest";

// Debugging assignments need the code runner, so public copy must not promise them until the flag is on.
const loadPublicCopy = async (flag) => {
    vi.resetModules();
    vi.stubEnv("VITE_ENABLE_DEBUGGING_ASSESSMENTS", flag);
    const [{ SEARCH_LANDING_PAGES }, brand] = await Promise.all([
        import("../utils/searchLandingPages"),
        import("../utils/brandEntity"),
    ]);
    return JSON.stringify({ SEARCH_LANDING_PAGES, brand });
};

describe("debugging assessment feature flag", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("keeps debugging assignments out of public copy when off", async () => {
        const copy = await loadPublicCopy("false");
        expect(copy).not.toMatch(/debugging-interview-practice|hidden tests|multi-file|Debugging Interviews|& Debugging/i);
    });

    it("publishes the debugging page and claims when on", async () => {
        const copy = await loadPublicCopy("true");
        expect(copy).toContain("debugging-interview-practice");
        expect(copy).toMatch(/hidden tests/);
        expect(copy).toContain("Coding, System Design & Debugging Interviews");
    });
});
