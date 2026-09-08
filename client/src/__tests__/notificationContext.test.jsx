import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { NotificationProvider, useNotifications, useNotify } from "../context/NotificationContext";
import { AuthContext } from "../context/AuthContext";

function NotificationHarness() {
    const notify = useNotify();
    const { notifications, unreadCount, markNotificationRead, markAllRead, dismissNotification } = useNotifications();
    return <>
        <button onClick={() => notify("Changes saved.", "success")}>Save</button>
        <button onClick={() => notify("Request failed.", "error")}>Fail</button>
        <button onClick={() => notify("Request failed.", "error")}>Fail duplicate</button>
        <button onClick={() => notify("Important update.", "info", { persist: true })}>Persistent info</button>
        <button onClick={() => markAllRead()}>Mark all</button>
        <button onClick={() => notifications[0] && markNotificationRead(notifications[0].id)}>Mark first</button>
        <button onClick={() => notifications[0] && dismissNotification(notifications[0].id)}>Dismiss first</button>
        <span data-testid="unread">{unreadCount}</span>
        <span data-testid="count">{notifications.length}</span>
    </>;
}

const renderNotifications = (userId = "user-1") => render(
    <AuthContext.Provider value={{ user: userId ? { _id: userId } : null }}>
        <NotificationProvider><NotificationHarness /></NotificationProvider>
    </AuthContext.Provider>,
);

beforeEach(() => window.sessionStorage.clear());

describe("NotificationProvider", () => {
    it("shows success feedback without turning it into an unread bell item", async () => {
        renderNotifications();
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        expect((await screen.findByRole("status")).textContent).toContain("Changes saved.");
        expect(screen.getByTestId("unread").textContent).toBe("0");
        expect(screen.getByTestId("count").textContent).toBe("0");
    });

    it("keeps failures in history and deduplicates rapid repeats", async () => {
        renderNotifications();
        fireEvent.click(screen.getByRole("button", { name: "Fail" }));
        expect((await screen.findByRole("alert")).textContent).toContain("Request failed.");
        expect(screen.getByTestId("unread").textContent).toBe("1");
        fireEvent.click(screen.getByRole("button", { name: "Fail duplicate" }));
        expect(screen.getByTestId("count").textContent).toBe("1");
        fireEvent.click(screen.getByRole("button", { name: "Mark first" }));
        expect(screen.getByTestId("unread").textContent).toBe("0");
    });

    it("allows callers to explicitly persist a meaningful non-error event", () => {
        renderNotifications();
        fireEvent.click(screen.getByRole("button", { name: "Persistent info" }));
        expect(screen.getByTestId("count").textContent).toBe("1");
        fireEvent.click(screen.getByRole("button", { name: "Dismiss first" }));
        expect(screen.getByTestId("count").textContent).toBe("0");
    });

    it("does not expose one account's notification history to another account", () => {
        const first = renderNotifications("user-a");
        fireEvent.click(screen.getByRole("button", { name: "Fail" }));
        expect(screen.getByTestId("count").textContent).toBe("1");
        first.unmount();

        renderNotifications("user-b");
        expect(screen.getByTestId("count").textContent).toBe("0");
    });
});
