import { describe, expect, it } from "vitest";
import User from "../../models/User.js";

describe("User email identity", () => {
    it("normalizes email storage to lowercase", () => {
        const path = User.schema.path("email");
        expect(path.options.lowercase).toBe(true);
        expect(path.options.trim).toBe(true);
    });
});
