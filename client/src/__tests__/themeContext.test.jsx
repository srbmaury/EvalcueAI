import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeModeProvider, useThemeMode } from "../context/ThemeContext";

function Harness() {
    const { mode, toggle } = useThemeMode();
    return <button onClick={toggle}>{mode}</button>;
}

describe("ThemeModeProvider", () => {
    beforeEach(() => {
        window.localStorage.clear();
        document.cookie = "evalcue_theme=; Max-Age=0; Path=/";
        document.documentElement.classList.remove("dark");
        delete document.documentElement.dataset.theme;
    });

    it("defaults to light and persists toggles to the DOM, storage, and cookie", async () => {
        render(<ThemeModeProvider><Harness /></ThemeModeProvider>);
        const toggle = screen.getByRole("button", { name: "light" });
        expect(window.localStorage.getItem("ia:theme")).toBe("light");
        expect(document.cookie).toContain("evalcue_theme=light");
        expect(document.documentElement.classList.contains("dark")).toBe(false);

        fireEvent.click(toggle);
        await waitFor(() => expect(screen.getByRole("button", { name: "dark" })).toBeTruthy());
        expect(window.localStorage.getItem("ia:theme")).toBe("dark");
        expect(document.cookie).toContain("evalcue_theme=dark");
        expect(document.documentElement.classList.contains("dark")).toBe(true);

        fireEvent.click(screen.getByRole("button", { name: "dark" }));
        await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(false));
    });

    it("restores a valid saved mode and ignores an invalid one", () => {
        window.localStorage.setItem("ia:theme", "dark");
        const dark = render(<ThemeModeProvider><Harness /></ThemeModeProvider>);
        expect(screen.getByRole("button", { name: "dark" })).toBeTruthy();
        expect(document.documentElement.classList.contains("dark")).toBe(true);
        dark.unmount();

        document.cookie = "evalcue_theme=; Max-Age=0; Path=/";
        window.localStorage.setItem("ia:theme", "sepia");
        render(<ThemeModeProvider><Harness /></ThemeModeProvider>);
        expect(screen.getByRole("button", { name: "light" })).toBeTruthy();
    });

    it("prefers the shared cookie over origin-local storage", () => {
        window.localStorage.setItem("ia:theme", "light");
        document.cookie = "evalcue_theme=dark; Path=/";
        render(<ThemeModeProvider><Harness /></ThemeModeProvider>);
        expect(screen.getByRole("button", { name: "dark" })).toBeTruthy();
        expect(document.documentElement.classList.contains("dark")).toBe(true);
    });

    it("continues when browser storage is unavailable", () => {
        const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
        render(<ThemeModeProvider><Harness /></ThemeModeProvider>);
        expect(screen.getByRole("button", { name: "light" })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "light" }));
        expect(screen.getByRole("button", { name: "dark" })).toBeTruthy();
        setItem.mockRestore();
    });
});
