import { describe, expect, it } from "vitest";
import User from "../../models/User.js";

describe("Google identity binding schema", () => {
    it("keeps Google subject identifiers unique when present", () => {
        const indexes = User.schema.indexes();
        expect(indexes.some(([fields, options]) => fields.googleId === 1 && options.unique === true)).toBe(true);
    });
});
