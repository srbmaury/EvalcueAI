import { describe, expect, it } from "vitest";
import SsoDomainClaim from "../../models/SsoDomainClaim.js";

describe("SSO domain claims", () => {
    it("declares a unique canonical domain index", () => {
        const indexes = SsoDomainClaim.schema.indexes();
        expect(indexes.some(([fields, options]) => fields.domain === 1 && options.unique === true)).toBe(true);
    });
});
