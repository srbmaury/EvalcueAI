import { describe, expect, it } from "vitest";
import { extractJobPost, validatePublicJobUrl } from "../../services/jobPostImporter.js";

describe("job-post importer", () => {
    it("extracts structured JobPosting data", () => {
        const result = extractJobPost(`
            <html><script type="application/ld+json">{
                "@context":"https://schema.org",
                "@type":"JobPosting",
                "title":"Senior Platform Engineer",
                "description":"<p>Build reliable distributed systems and mentor engineers across the platform team.</p>",
                "hiringOrganization":{"@type":"Organization","name":"Acme"}
            }</script></html>
        `, "https://jobs.example.com/42");

        expect(result).toMatchObject({
            company: "Acme",
            jobRole: "Senior Platform Engineer",
            jobDescription: "Build reliable distributed systems and mentor engineers across the platform team.",
            sourceUrl: "https://jobs.example.com/42",
        });
    });

    it("merges rich structured fields instead of dropping responsibilities and qualifications", () => {
        const result = extractJobPost(`
            <html><script type="application/ld+json">{
                "@context":"https://schema.org",
                "@type":"JobPosting",
                "title":"Backend Engineer",
                "description":"Build APIs for a distributed commerce platform.",
                "responsibilities":["Own Java services", "Improve Kafka reliability"],
                "qualifications":["4+ years backend experience", "Strong PostgreSQL knowledge"],
                "skills":["Java", "Kafka", "PostgreSQL"],
                "employmentType":"FULL_TIME",
                "jobLocation":{"address":{"addressLocality":"Bengaluru","addressCountry":"IN"}},
                "hiringOrganization":{"name":"Example Labs"}
            }</script></html>
        `, "https://jobs.example.com/backend");

        expect(result.jobDescription).toContain("Own Java services");
        expect(result.jobDescription).toContain("Strong PostgreSQL knowledge");
        expect(result.jobDescription).toContain("Kafka");
        expect(result.location).toContain("Bengaluru");
        expect(result.employmentType).toBe("FULL_TIME");
        expect(result.extractionQuality).not.toBe("low");
    });

    it("prefers useful page job content over a tiny SEO description", () => {
        const result = extractJobPost(`
            <html><head>
                <meta property="og:site_name" content="Example Careers">
                <meta property="og:title" content="Frontend Engineer">
                <meta name="description" content="Apply for Frontend Engineer.">
            </head><body><main>
                <h2>What you'll do</h2>
                <p>Own accessible React experiences, frontend performance, automated testing, design-system components, and reliable release delivery.</p>
                <h2>Requirements</h2>
                <p>Strong JavaScript, React, browser performance, accessibility, and testing experience.</p>
            </main></body></html>
        `, "https://example.com/jobs/frontend");

        expect(result.company).toBe("Example Careers");
        expect(result.jobRole).toBe("Frontend Engineer");
        expect(result.jobDescription).toContain("accessible React experiences");
        expect(result.jobDescription.length).toBeGreaterThan(150);
    });

    it("extracts generic embedded application state when JobPosting JSON-LD is absent", () => {
        const result = extractJobPost(`
            <html><script id="__NEXT_DATA__" type="application/json">{
                "props":{"pageProps":{"job":{"jobTitle":"Site Reliability Engineer","jobDescription":"Operate a multi-region platform and improve incident response automation.","companyName":"Infra Co","requirements":["Linux", "Kubernetes", "observability"]}}}
            }</script></html>
        `, "https://careers.example.com/jobs/sre");
        expect(result).toMatchObject({ company: "Infra Co", jobRole: "Site Reliability Engineer" });
        expect(result.jobDescription).toContain("incident response automation");
    });

    it("falls back to page metadata", () => {
        const result = extractJobPost(`
            <html><head>
                <meta property="og:site_name" content="Example Careers">
                <meta property="og:title" content="Frontend Engineer">
                <meta name="description" content="Own accessible React experiences, performance, testing, and delivery.">
            </head></html>
        `, "https://example.com/jobs/frontend");

        expect(result.company).toBe("Example Careers");
        expect(result.jobRole).toBe("Frontend Engineer");
        expect(result.jobDescription).toContain("accessible React experiences");
    });

    it("rejects pages without enough useful job content", () => {
        expect(() => extractJobPost("<title>Careers</title><main>Short</main>", "https://example.com/jobs"))
            .toThrow("couldn’t extract enough job details");
    });

    it("rejects loopback targets before making a request", async () => {
        await expect(validatePublicJobUrl("http://127.0.0.1/internal"))
            .rejects.toThrow("Private network URLs are not allowed");
        await expect(validatePublicJobUrl("http://[::ffff:127.0.0.1]/internal"))
            .rejects.toThrow("Private network URLs are not allowed");
    });
});
