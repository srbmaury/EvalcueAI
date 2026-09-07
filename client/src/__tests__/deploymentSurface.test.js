import { describe, expect, it } from "vitest";
import {
    configuredSurface,
    deploymentSurfaceForPath,
    externalSurfaceUrl,
    surfaceHomePath,
} from "../utils/deploymentSurface";

describe("deployment surfaces", () => {
    it("accepts only supported deployment surface values", () => {
        expect(configuredSurface("practice")).toBe("practice");
        expect(configuredSurface("hiring")).toBe("hiring");
        expect(configuredSurface("landing")).toBe("landing");
        expect(configuredSurface("all")).toBeNull();
    });

    it("routes candidate assessments to the practice deployment", () => {
        expect(deploymentSurfaceForPath("/assessment/token")).toBe("practice");
        expect(deploymentSurfaceForPath("/hire/team")).toBe("hiring");
        expect(deploymentSurfaceForPath("/practice/dashboard")).toBe("practice");
        expect(deploymentSurfaceForPath("/docs")).toBe("landing");
    });

    it("builds cross-domain URLs without duplicate slashes", () => {
        const env = {
            VITE_LANDING_ORIGIN: "https://evalcueai.com",
            VITE_PRACTICE_ORIGIN: "https://practice.evalcueai.com/",
            VITE_HIRING_ORIGIN: "https://hiring.evalcueai.com",
        };
        expect(externalSurfaceUrl("practice", "/assessment/abc", env)).toBe("https://practice.evalcueai.com/assessment/abc");
        expect(externalSurfaceUrl("practice", "", env)).toBe("https://practice.evalcueai.com/practice");
        expect(surfaceHomePath("hiring")).toBe("/hire");
        expect(surfaceHomePath("landing")).toBe("/");
    });
});
