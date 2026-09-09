import { describe, expect, it } from "vitest";
import { resolveAuthRedirectPath } from "../api/axios";

describe("resolveAuthRedirectPath", () => {
    it("returns product-scoped login routes for protected surfaces", () => {
        expect(resolveAuthRedirectPath("/practice/dashboard")).toBe("/practice/login");
        expect(resolveAuthRedirectPath("/practice/interviews/123")).toBe("/practice/login");
        expect(resolveAuthRedirectPath("/hire/assessments")).toBe("/hire/login");
        expect(resolveAuthRedirectPath("/assessments/123")).toBe("/hire/login");
    });

    it("keeps generic login for unscoped routes", () => {
        expect(resolveAuthRedirectPath("/login")).toBe("/login");
        expect(resolveAuthRedirectPath("/unknown")).toBe("/login");
    });
});
