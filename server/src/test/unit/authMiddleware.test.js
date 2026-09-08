import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), findById: vi.fn(), inc: vi.fn(), labels: vi.fn() }));
mocks.labels.mockReturnValue({ inc: mocks.inc });
vi.mock("jsonwebtoken", () => ({ default: { verify: mocks.verify } }));
vi.mock("../../models/User.js", () => ({ default: { findById: mocks.findById } }));
vi.mock("../../metrics/index.js", () => ({ default: { authorizationDeniedTotal: { labels: mocks.labels } } }));
vi.mock("../../metrics/routes.js", () => ({ normalizeRoute: () => "/normalized" }));

import protect from "../../middleware/authMiddleware.js";

const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() });

describe("authentication middleware", () => {
    beforeEach(() => vi.clearAllMocks());

    it("rejects missing and malformed bearer tokens", async () => {
        for (const header of [undefined, "Basic abc"]) {
            const res = response();
            await protect({ get: () => header }, res, vi.fn());
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ message: "Not authorized" });
        }
        expect(mocks.labels).toHaveBeenCalledWith("missing_token", "/normalized");
    });

    it("attaches a verified user and accepts case-insensitive bearer headers", async () => {
        const user = { _id: "user-1", tokenVersion: 3 };
        mocks.verify.mockReturnValue({ id: "user-1", tokenVersion: 3 });
        const select = vi.fn().mockResolvedValue(user);
        mocks.findById.mockReturnValue({ select });
        const req = { get: (name) => name === "authorization" ? "bEaReR valid-token" : undefined };
        const next = vi.fn();
        await protect(req, response(), next);
        expect(mocks.verify).toHaveBeenCalledWith("valid-token", process.env.JWT_SECRET);
        expect(req.user).toBe(user);
        expect(next).toHaveBeenCalledWith();
    });

    it("rejects deleted users and invalidated sessions", async () => {
        mocks.verify.mockReturnValue({ id: "user-1", tokenVersion: 2 });
        mocks.findById.mockReturnValueOnce({ select: vi.fn().mockResolvedValue(null) });
        const deleted = response();
        await protect({ get: () => "Bearer token" }, deleted, vi.fn());
        expect(deleted.json).toHaveBeenCalledWith({ message: "User not found" });
        expect(mocks.labels).toHaveBeenCalledWith("user_missing", "/normalized");

        mocks.findById.mockReturnValueOnce({ select: vi.fn().mockResolvedValue({ _id: "user-1", tokenVersion: 3 }) });
        const expired = response();
        await protect({ get: () => "Bearer token" }, expired, vi.fn());
        expect(expired.json).toHaveBeenCalledWith({ message: "Session expired" });
        expect(mocks.labels).toHaveBeenCalledWith("session_expired", "/normalized");
    });

    it("handles token verification failures without exposing details", async () => {
        mocks.verify.mockImplementation(() => { throw new Error("bad signature"); });
        const res = response();
        await protect({ get: () => "Bearer invalid" }, res, vi.fn());
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ message: "Not authorized" });
        expect(mocks.labels).toHaveBeenCalledWith("invalid_token", "/normalized");
    });
});
