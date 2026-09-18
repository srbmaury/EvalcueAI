import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Captcha from "../components/Captcha.jsx";

vi.mock("../hooks/usePublicConfig", () => ({ default: vi.fn() }));
import usePublicConfig from "../hooks/usePublicConfig";

afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("local CAPTCHA exemption", () => {
    it("does not mount a CAPTCHA in local development", () => {
        vi.stubEnv("DEV", true);
        vi.stubEnv("VITE_CAPTCHA_LOCAL_ENABLED", "false");
        usePublicConfig.mockReturnValue({ captcha: { enabled: true, provider: "turnstile", siteKey: "test-key" } });
        const { container } = render(<Captcha />);
        expect(container.innerHTML).toBe("");
    });
    it("cannot disable production CAPTCHA with the local flag", async () => {
        vi.stubEnv("DEV", false);
        vi.stubEnv("VITE_CAPTCHA_LOCAL_ENABLED", "false");
        // Server-driven CAPTCHA reports enabled but is missing its site key — a real
        // misconfiguration (e.g. CAPTCHA_ENABLED=true with no CAPTCHA_SITE_KEY set),
        // and it must surface as an error rather than silently rendering nothing,
        // which would let a candidate/user submit the form with no CAPTCHA at all.
        usePublicConfig.mockReturnValue({ captcha: { enabled: true, provider: "turnstile", siteKey: "" } });
        render(<Captcha provider="turnstile" />);
        expect(await screen.findByText("CAPTCHA is enabled but its public site key is not configured.")).toBeTruthy();
    });
});
