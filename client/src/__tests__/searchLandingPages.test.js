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
        expect(paths.length).toBeGreaterThanOrEqual(19);

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
            if (page.schema !== "AboutPage") expect(page.faq.length).toBeGreaterThanOrEqual(2);
            expect(page.related.length).toBeGreaterThanOrEqual(3);
        }
    });

    it("covers the highest-value software engineering interview intents", () => {
        expect(searchLandingPaths()).toEqual(expect.arrayContaining([
            "/ai-interview-practice",
            "/system-design-interview-practice",
            "/coding-interview-practice",
            "/backend-engineer-interview-practice",
            "/system-design",
            "/system-design/url-shortener",
            "/system-design/rate-limiter",
            "/system-design/google-drive",
            "/system-design/notification-service",
            "/system-design/payment-system",
            "/interview-questions",
            "/interview-questions/java",
            "/interview-questions/spring-boot",
            "/interview-questions/redis",
            "/interview-questions/distributed-systems",
            "/interview-questions/microservices",
        ]));
    });

    it("builds connected topical clusters rather than orphan pages", () => {
        const systemDesignPages = SEARCH_LANDING_PAGES.filter((page) => page.path === "/system-design" || page.path.startsWith("/system-design/"));
        const interviewQuestionPages = SEARCH_LANDING_PAGES.filter((page) => page.path === "/interview-questions" || page.path.startsWith("/interview-questions/"));

        expect(systemDesignPages).toHaveLength(6);
        expect(interviewQuestionPages).toHaveLength(6);

        for (const page of [...systemDesignPages, ...interviewQuestionPages]) {
            for (const relatedSlug of page.related) {
                expect(SEARCH_LANDING_PAGES.some((candidate) => candidate.slug === relatedSlug)).toBe(true);
            }
        }
    });

    it("keeps the merged practice pages retired", () => {
        for (const path of ["/ai-mock-interview", "/software-engineer-interview-practice", "/technical-interview-practice"]) {
            expect(searchLandingPageForPath(path)).toBeNull();
        }
        for (const page of SEARCH_LANDING_PAGES) {
            for (const relatedSlug of page.related) {
                expect(SEARCH_LANDING_PAGES.some((candidate) => candidate.slug === relatedSlug)).toBe(true);
            }
        }
    });

    it("answers every question on the interview question pages", () => {
        const questionPages = SEARCH_LANDING_PAGES.filter((page) => page.path.startsWith("/interview-questions/"));
        expect(questionPages).toHaveLength(5);
        for (const page of questionPages) {
            for (const section of page.sections) {
                expect(section.questions.length).toBeGreaterThanOrEqual(3);
                for (const [question, answer] of section.questions) {
                    expect(question.endsWith("?")).toBe(true);
                    expect(answer.length).toBeGreaterThan(60);
                }
            }
        }
    });
});
