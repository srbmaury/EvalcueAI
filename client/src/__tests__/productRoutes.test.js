import { describe, expect, it } from "vitest";
import {
    productHomePath,
    productLoginPath,
    productRegisterPath,
    surfaceForPath,
    workspaceForSurface,
} from "../utils/productRoutes";

describe("productRoutes", () => {
    it("recognizes practice routes", () => {
        expect(surfaceForPath("/practice/dashboard")).toBe("practice");
        expect(surfaceForPath("/practice/interviews/abc")).toBe("practice");
    });

    it("recognizes hiring routes", () => {
        expect(surfaceForPath("/hire/assessments")).toBe("hiring");
        expect(surfaceForPath("/hire/team")).toBe("hiring");
    });

    it("keeps public candidate assessment links and retired paths neutral", () => {
        expect(surfaceForPath("/assessment/token")).toBeNull();
        expect(surfaceForPath("/dashboard")).toBeNull();
        expect(surfaceForPath("/hiring/team")).toBeNull();
    });

    it("returns product-specific auth and home destinations", () => {
        expect(productHomePath("practice")).toBe("/practice/dashboard");
        expect(productHomePath("hiring")).toBe("/hire/assessments");
        expect(productLoginPath("practice")).toBe("/practice/login");
        expect(productLoginPath("hiring")).toBe("/hire/login");
        expect(productRegisterPath("practice")).toBe("/practice/register");
        expect(productRegisterPath("hiring")).toBe("/hire/register");
        expect(workspaceForSurface("practice")).toBe("practice");
        expect(workspaceForSurface("hiring")).toBe("hiring");
    });
});
