import { describe, expect, it } from "vitest";
import { isIndexablePath } from "../components/SearchIndexPolicy";
import { seoForPath } from "../components/PublicRouteSeo";
import {
    PRODUCT_RESOURCE_PAGES,
    resourcePathFor,
    resourcePathsForSurface,
} from "../utils/productResourcePages";

describe("interactive product resource pages", () => {
    it("keeps every configured resource unique and indexable", () => {
        const paths = PRODUCT_RESOURCE_PAGES.map(resourcePathFor);
        expect(new Set(paths).size).toBe(paths.length);
        expect(resourcePathsForSurface("practice")).toHaveLength(6);
        expect(resourcePathsForSurface("hiring")).toHaveLength(5);

        for (const page of PRODUCT_RESOURCE_PAGES) {
            const path = resourcePathFor(page);
            expect(isIndexablePath(path)).toBe(true);
            expect(seoForPath(path)).toMatchObject({
                title: page.metaTitle,
                description: page.description,
                canonicalPath: path,
                schema: "TechArticle",
            });
            expect(page.examples.length).toBeGreaterThanOrEqual(3);
            expect(page.roles.length).toBeGreaterThanOrEqual(3);
        }
    });

    it("keeps practice and hiring resources on their product surfaces", () => {
        expect(resourcePathsForSurface("practice").every((path) => path.startsWith("/practice/resources/"))).toBe(true);
        expect(resourcePathsForSurface("hiring").every((path) => path.startsWith("/hire/resources/"))).toBe(true);
    });
});
