import { describe, expect, it } from "vitest";
import { isIndexablePath } from "../components/SearchIndexPolicy";
import { seoForPath } from "../components/PublicRouteSeo";
import {
    SEARCH_LANDING_PAGES,
    searchLandingPageForPath,
    searchLandingPaths,
} from "../utils/searchLandingPages";

describe("search-focused interview landing pages", () => {
    it("keeps every search landing route unique, indexable, and canonically described", () => {
        const paths = searchLandingPaths();
        expect(new Set(paths).size).toBe(paths.length);
        expect(paths.length).toBeGreaterThanOrEqual(8);

        for (const page of SEARCH_LANDING_PAGES) {
            expect(page.path.startsWith("/")).toBe(true);
            expect(searchLandingPageForPath(page.path)).toEqual(page);
            expect(isIndexablePath(page.path)).toBe(true);
            expect(seoForPath(page.path)).toMatchObject({
                title: page.metaTitle,
                description: page.description,
                canonicalPath: page.path,
                schema: page.schema,
            });
            expect(page.sections.length).toBeGreaterThanOrEqual(3);
            expect(page.faq.length).toBeGreaterThanOrEqual(3);
            expect(page.related.length).toBeGreaterThanOrEqual(3);
        }
    });

    it("covers the highest-value software engineering interview intents", () => {
        expect(searchLandingPaths()).toEqual(expect.arrayContaining([
            "/ai-interview-practice",
            "/ai-mock-interview",
            "/software-engineer-interview-practice",
            "/technical-interview-practice",
            "/system-design-interview-practice",
            "/coding-interview-practice",
            "/backend-engineer-interview-practice",
            "/debugging-interview-practice",
        ]));
    });
});
