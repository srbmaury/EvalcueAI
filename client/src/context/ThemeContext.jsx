/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";

const THEME_STORAGE_KEY = "ia:theme";
const THEME_COOKIE_NAME = "evalcue_theme";
const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const isThemeMode = (value) => value === "dark" || value === "light";

const readThemeCookie = () => {
    try {
        const prefix = `${THEME_COOKIE_NAME}=`;
        const cookie = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
        const value = cookie ? decodeURIComponent(cookie.slice(prefix.length)) : "";
        return isThemeMode(value) ? value : null;
    } catch {
        return null;
    }
};

const readThemePreference = () => {
    if (typeof window === "undefined") return "light";
    const cookieMode = readThemeCookie();
    if (cookieMode) return cookieMode;
    try {
        const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
        if (isThemeMode(saved)) return saved;
    } catch { /* Storage can be unavailable in privacy mode. */ }
    const initialDomMode = document.documentElement?.dataset?.theme;
    return isThemeMode(initialDomMode) ? initialDomMode : "light";
};

const sharedCookieDomain = () => {
    try {
        const hostname = window.location.hostname.toLowerCase();
        return hostname === "evalcueai.com" || hostname.endsWith(".evalcueai.com") ? "; Domain=.evalcueai.com" : "";
    } catch {
        return "";
    }
};

const persistThemePreference = (mode) => {
    try { window.localStorage.setItem(THEME_STORAGE_KEY, mode); } catch { /* Storage is optional. */ }
    try {
        const secure = window.location.protocol === "https:" ? "; Secure" : "";
        document.cookie = `${THEME_COOKIE_NAME}=${encodeURIComponent(mode)}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${sharedCookieDomain()}${secure}`;
    } catch { /* Cookies can be unavailable or blocked. */ }
};

const applyDocumentTheme = (mode) => {
    try {
        const root = document.documentElement;
        root.classList.toggle("dark", mode === "dark");
        root.dataset.theme = mode;
        root.style.colorScheme = mode;
        const themeColor = document.querySelector('meta[name="theme-color"]');
        if (themeColor) themeColor.setAttribute("content", mode === "dark" ? "#0e0f11" : "#ffffff");
    } catch { /* DOM access can be unavailable during non-browser rendering. */ }
};

export const ThemeModeContext = createContext({ mode: "light", toggle: () => {} });

export const useThemeMode = () => useContext(ThemeModeContext);

export const ThemeModeProvider = ({ children }) => {
    const [mode, setMode] = useState(readThemePreference);

    useEffect(() => {
        persistThemePreference(mode);
        applyDocumentTheme(mode);
    }, [mode]);

    useEffect(() => {
        const syncTheme = () => {
            const sharedMode = readThemeCookie();
            if (sharedMode) setMode((current) => current === sharedMode ? current : sharedMode);
        };
        const onVisibilityChange = () => {
            if (document.visibilityState === "visible") syncTheme();
        };
        window.addEventListener("focus", syncTheme);
        window.addEventListener("storage", syncTheme);
        document.addEventListener("visibilitychange", onVisibilityChange);
        return () => {
            window.removeEventListener("focus", syncTheme);
            window.removeEventListener("storage", syncTheme);
            document.removeEventListener("visibilitychange", onVisibilityChange);
        };
    }, []);

    const toggle = useCallback(() => {
        setMode((currentMode) => (currentMode === "light" ? "dark" : "light"));
    }, []);

    const muiTheme = useMemo(() => createTheme({
        palette: {
            mode,
            primary: { main: mode === "dark" ? "#7aaeff" : "#2451c7", light: "#4f7ff0", dark: "#1b3e9c" },
            secondary: { main: mode === "dark" ? "#45d5bd" : "#0b7a6a" },
            // Light-mode status colours darkened so white chip text meets WCAG AA (4.5:1); MUI's defaults don't.
            ...(mode === "light" ? { warning: { main: "#b45309" }, info: { main: "#0369a1" } } : {}),
            background: mode === "dark" ? { default: "#0e0f11", paper: "#17191c" } : { default: "#f7f8fa", paper: "#ffffff" },
        },
        shape: { borderRadius: 6 },
        typography: {
            fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            button: { textTransform: "none", fontWeight: 600 },
        },
        components: {
            MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { borderRadius: 4, minHeight: 40, whiteSpace: "normal", overflowWrap: "normal", wordBreak: "normal", textAlign: "center" }, containedPrimary: { boxShadow: "none" } } },
            MuiCard: { styleOverrides: { root: { borderRadius: 6, backgroundImage: "none" } } },
            MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
            MuiTextField: { defaultProps: { variant: "outlined" } },
            MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 4 } } },
            // Progress bars need an accessible name; callers pass a specific aria-label where one exists.
            MuiLinearProgress: { defaultProps: { "aria-label": "Progress" } },
            MuiChip: { styleOverrides: { root: { fontWeight: 600, maxWidth: "100%", height: "auto", minHeight: 32 }, label: { whiteSpace: "normal", overflowWrap: "break-word", paddingTop: 4, paddingBottom: 4 } } },
            MuiTypography: { styleOverrides: { root: { overflowWrap: "break-word" } } },
            MuiAlert: { styleOverrides: { message: { minWidth: 0, overflowWrap: "break-word" } } },
            MuiFormControlLabel: { styleOverrides: { root: { minWidth: 0 }, label: { minWidth: 0, overflowWrap: "break-word" } } },
        },
    }), [mode]);

    const value = useMemo(() => ({ mode, toggle }), [mode, toggle]);

    return (
        <ThemeModeContext.Provider value={value}>
            <ThemeProvider theme={muiTheme}>
                <CssBaseline />
                {children}
            </ThemeProvider>
        </ThemeModeContext.Provider>
    );
};
