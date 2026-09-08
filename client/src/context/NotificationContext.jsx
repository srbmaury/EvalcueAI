import { Alert, Snackbar } from "@mui/material";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AuthContext } from "./AuthContext";
import { practiceLimitHandledRecently } from "../utils/appEvents";

const STORAGE_PREFIX = "evalcue:notifications";
const VALID_SEVERITIES = new Set(["info", "success", "warning", "error"]);
const HISTORY_LIMIT = 20;
const DEDUPE_WINDOW_MS = 60_000;
const normalizeHistory = (value) => Array.isArray(value) ? value.filter((item) => item?.message).map((item) => ({ ...item, read: Boolean(item.read) })).slice(0, HISTORY_LIMIT) : [];
const storageKeyFor = (userId) => `${STORAGE_PREFIX}:${userId || "guest"}`;
const readHistory = (key) => { try { return normalizeHistory(JSON.parse(window.sessionStorage?.getItem(key) || "[]")); } catch { return []; } };
const writeHistory = (key, items) => { try { window.sessionStorage?.setItem(key, JSON.stringify(items)); } catch { /* Continue without history persistence. */ } };
const NotificationContext = createContext({ notify: () => {}, notifications: [], unreadCount: 0, markNotificationRead: () => {}, markAllRead: () => {}, dismissNotification: () => {}, clearNotifications: () => {} });

export function NotificationProvider({ children }) {
    const { user } = useContext(AuthContext) || {};
    const storageKey = useMemo(() => storageKeyFor(user?._id), [user?._id]);
    const [notification, setNotification] = useState(null);
    const [notifications, setNotifications] = useState(() => readHistory(storageKey));

    useEffect(() => {
        setNotification(null);
        setNotifications(readHistory(storageKey));
    }, [storageKey]);

    const updateHistory = useCallback((updater) => {
        setNotifications((current) => {
            const next = normalizeHistory(typeof updater === "function" ? updater(current) : updater);
            writeHistory(storageKey, next);
            return next;
        });
    }, [storageKey]);

    const notify = useCallback((message, severity = "info", options = {}) => {
        const cleanMessage = String(message || "").trim();
        if (!cleanMessage) return;
        const safeSeverity = VALID_SEVERITIES.has(severity) ? severity : "info";

        // A quota response gets its own actionable dialog. Callers may still emit
        // a generic catch-message immediately afterwards; suppress that duplicate.
        if ((safeSeverity === "error" || safeSeverity === "warning") && practiceLimitHandledRecently()) return;

        const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, message: cleanMessage, severity: safeSeverity, at: new Date().toISOString(), read: false };
        setNotification(item);

        // Most calls to notify() are immediate action feedback (save/upload/create)
        // and should not become unread bell items. Keep only failures by default;
        // callers can opt meaningful events into history with { persist: true }.
        const persist = options?.persist ?? safeSeverity === "error";
        if (!persist) return;

        updateHistory((current) => {
            const now = Date.now();
            const duplicateIndex = current.findIndex((entry) => (
                entry.message === cleanMessage
                && entry.severity === safeSeverity
                && now - new Date(entry.at).getTime() < DEDUPE_WINDOW_MS
            ));
            if (duplicateIndex < 0) return [item, ...current];
            const duplicate = current[duplicateIndex];
            return [{ ...duplicate, at: item.at, read: false }, ...current.filter((_, index) => index !== duplicateIndex)];
        });
    }, [updateHistory]);

    const markNotificationRead = useCallback((id) => updateHistory((current) => current.map((item) => item.id === id ? { ...item, read: true } : item)), [updateHistory]);
    const markAllRead = useCallback(() => updateHistory((current) => current.map((item) => item.read ? item : { ...item, read: true })), [updateHistory]);
    const dismissNotification = useCallback((id) => updateHistory((current) => current.filter((item) => item.id !== id)), [updateHistory]);
    const clearNotifications = useCallback(() => {
        setNotifications([]);
        try { window.sessionStorage?.removeItem(storageKey); } catch { /* no-op */ }
    }, [storageKey]);
    const unreadCount = useMemo(() => notifications.reduce((count, item) => count + (item.read ? 0 : 1), 0), [notifications]);
    const close = useCallback((_, reason) => { if (reason !== "clickaway") setNotification(null); }, []);
    const autoHideDuration = notification?.severity === "error" ? 7000 : notification?.severity === "warning" ? 5500 : notification?.severity === "success" ? 3500 : 4500;
    const value = useMemo(() => ({ notify, notifications, unreadCount, markNotificationRead, markAllRead, dismissNotification, clearNotifications }), [notify, notifications, unreadCount, markNotificationRead, markAllRead, dismissNotification, clearNotifications]);

    return <NotificationContext.Provider value={value}>{children}<Snackbar key={notification?.id} open={Boolean(notification)} autoHideDuration={autoHideDuration} onClose={close} anchorOrigin={{ vertical: "bottom", horizontal: "center" }} sx={{ bottom: { xs: 16, sm: 24 }, maxWidth: "calc(100vw - 24px)" }}><Alert onClose={close} severity={notification?.severity || "info"} variant="filled" elevation={8} role={notification?.severity === "error" ? "alert" : "status"} sx={{ width: "100%", maxWidth: 560 }}>{notification?.message}</Alert></Snackbar></NotificationContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotify() {
    return useContext(NotificationContext).notify;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotifications() {
    return useContext(NotificationContext);
}
