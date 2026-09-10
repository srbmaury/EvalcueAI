import { createRef } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Captcha from "../components/Captcha";
import { ThemeModeProvider } from "../context/ThemeContext";

describe("Captcha reset", () => {
    beforeEach(() => {
        window.turnstile = {
            render: vi.fn((_container, options) => {
                options.callback("token-1");
                return "widget-1";
            }),
            reset: vi.fn(),
            remove: vi.fn(),
        };
    });

    it("clears the consumer token when reset after a consumed request", async () => {
        const onVerify = vi.fn();
        const onExpire = vi.fn();
        const ref = createRef();
        render(<ThemeModeProvider><Captcha ref={ref} onVerify={onVerify} onExpire={onExpire} /></ThemeModeProvider>);

        await waitFor(() => expect(onVerify).toHaveBeenCalledWith("token-1"));
        act(() => ref.current.reset());

        expect(window.turnstile.reset).toHaveBeenCalledWith("widget-1");
        expect(onExpire).toHaveBeenCalled();
    });
});
