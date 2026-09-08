import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import validate from "../../middleware/validate.js";

const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn() });

describe("validate middleware", () => {
    it("replaces a valid body with parsed and normalized values", () => {
        const req = { body: { name: "  Alice  ", age: "42" }, path: "/api/auth/profile" };
        const res = response();
        const next = vi.fn();
        validate(z.object({ name: z.string().trim(), age: z.coerce.number() }))(req, res, next);
        expect(req.body).toEqual({ name: "Alice", age: 42 });
        expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
        expect(next).toHaveBeenCalledWith();
    });

    it.each(["query", "params"])("mutates Express getter-backed %s objects", (source) => {
        const target = { stale: "remove", page: "2" };
        const req = { [source]: target, path: "/api/items" };
        const next = vi.fn();
        validate(z.object({ page: z.coerce.number() }), source)(req, response(), next);
        expect(target).toEqual({ page: 2 });
        expect(next).toHaveBeenCalledOnce();
    });

    it("returns structured validation errors", () => {
        const req = { body: { email: "invalid" }, path: "/api/auth/register" };
        const res = response();
        validate(z.object({ email: z.string().email() }))(req, res, vi.fn());
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ message: "Invalid request", details: [{ path: "email", message: expect.any(String) }] });
    });

    it("forwards unexpected schema failures", () => {
        const error = new Error("schema unavailable");
        const next = vi.fn();
        validate({ safeParse: () => { throw error; } })({ body: {}, path: "/api/items" }, response(), next);
        expect(next).toHaveBeenCalledWith(error);
    });
});
