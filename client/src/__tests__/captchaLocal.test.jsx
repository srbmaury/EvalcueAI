import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Captcha from "../components/Captcha.jsx";

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
describe("local CAPTCHA exemption", () => {
    it("does not mount a CAPTCHA in local development", () => {
        vi.stubEnv("DEV", true);
        vi.stubEnv("VITE_CAPTCHA_LOCAL_ENABLED", "false");
        const { container } = render(<Captcha />);
        expect(container.innerHTML).toBe("");
    });
    it("cannot disable production CAPTCHA with the local flag", async () => {
        vi.stubEnv("DEV", false);
        vi.stubEnv("VITE_CAPTCHA_LOCAL_ENABLED", "false");
        vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "");
        render(<Captcha provider="turnstile" />);
        expect(await screen.findByText("Missing VITE_TURNSTILE_SITE_KEY")).toBeTruthy();
    });
});
