import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ isValidObjectId: vi.fn(), findOne: vi.fn() }));
vi.mock("mongoose", () => ({ default: { isValidObjectId: mocks.isValidObjectId } }));
vi.mock("../../models/OrganizationMembership.js", () => ({ default: { findOne: mocks.findOne } }));

import { organizationContext, requireOrganizationRole } from "../../middleware/organizationContext.js";

const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() });

describe("organization context", () => {
    beforeEach(() => vi.clearAllMocks());

    it("requires a valid organization header", async () => {
        const missing = response();
        await organizationContext({ get: () => "", user: { _id: "user-1" } }, missing, vi.fn());
        expect(missing.status).toHaveBeenCalledWith(400);
        expect(missing.json).toHaveBeenCalledWith({ message: "Choose a hiring organization" });

        mocks.isValidObjectId.mockReturnValue(false);
        const invalid = response();
        await organizationContext({ get: () => "bad-id", user: { _id: "user-1" } }, invalid, vi.fn());
        expect(invalid.status).toHaveBeenCalledWith(400);
        expect(invalid.json).toHaveBeenCalledWith({ message: "Invalid organization" });
    });

    it("rejects users without active membership", async () => {
        mocks.isValidObjectId.mockReturnValue(true);
        mocks.findOne.mockReturnValue({ populate: vi.fn().mockResolvedValue(null) });
        const res = response();
        await organizationContext({ get: () => "org-1", user: { _id: "user-1" } }, res, vi.fn());
        expect(mocks.findOne).toHaveBeenCalledWith({ organization: "org-1", user: "user-1", status: "active" });
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it("attaches an active membership and role to the request", async () => {
        mocks.isValidObjectId.mockReturnValue(true);
        const organization = { _id: "org-1", name: "Acme" };
        const membership = { organization, role: "recruiter" };
        mocks.findOne.mockReturnValue({ populate: vi.fn().mockResolvedValue(membership) });
        const req = { get: () => " org-1 ", user: { _id: "user-1" } };
        const next = vi.fn();
        await organizationContext(req, response(), next);
        expect(req).toMatchObject({ organization, organizationId: "org-1", organizationMembership: membership, organizationRole: "recruiter" });
        expect(next).toHaveBeenCalledWith();
    });

    it("forwards database errors", async () => {
        const error = new Error("database unavailable");
        mocks.isValidObjectId.mockReturnValue(true);
        mocks.findOne.mockImplementation(() => { throw error; });
        const next = vi.fn();
        await organizationContext({ get: () => "org-1", user: { _id: "user-1" } }, response(), next);
        expect(next).toHaveBeenCalledWith(error);
    });

    it("enforces the allowed organization roles", () => {
        const middleware = requireOrganizationRole("owner", "admin");
        const allowedNext = vi.fn();
        middleware({ organizationMembership: {}, organizationRole: "owner" }, response(), allowedNext);
        expect(allowedNext).toHaveBeenCalledOnce();

        const denied = response();
        middleware({ organizationMembership: {}, organizationRole: "reviewer" }, denied, vi.fn());
        expect(denied.status).toHaveBeenCalledWith(403);
        expect(denied.json).toHaveBeenCalledWith({ message: "You do not have permission to perform this action" });
    });
});
