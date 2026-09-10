import { describe, expect, it, vi } from "vitest";
import requireRole from "../../middleware/requireRole.js";

vi.mock("../../metrics/index.js", () => ({ default: { authorizationDeniedTotal: { labels: () => ({ inc: vi.fn() }) } } }));
vi.mock("../../metrics/routes.js", () => ({ normalizeRoute: () => "/api/auth/reminders/test" }));

describe("admin-only reminder test access", () => {
    it("rejects a non-admin user", () => {
        const req = { user: { role: "user" } };
        const json = vi.fn();
        const res = { status: vi.fn(() => ({ json })) };
        const next = vi.fn();

        requireRole("admin")(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(json).toHaveBeenCalledWith({ message: "Forbidden" });
        expect(next).not.toHaveBeenCalled();
    });
});
