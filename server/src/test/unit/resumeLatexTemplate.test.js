import { describe, expect, it } from "vitest";
import { buildResumeLatex } from "../../utils/resumeLatexTemplate.js";

describe("buildResumeLatex", () => {
    it("produces a document with the fixed preamble and no pdfTeX-only glyphtounicode primitives", () => {
        const tex = buildResumeLatex({ name: "Jane Doe" });
        expect(tex).toContain("\\documentclass[letterpaper,11pt]{article}");
        expect(tex).toContain("\\begin{document}");
        expect(tex).toContain("\\end{document}");
        // Undefined under Tectonic's XeTeX engine — must never reappear in the template.
        expect(tex).not.toContain("glyphtounicode");
        expect(tex).not.toContain("\\pdfgentounicode");
    });

    it("omits a section entirely when its content array is empty", () => {
        const tex = buildResumeLatex({ name: "Jane Doe", experience: [], projects: [], education: [], skills: [], achievements: [] });
        expect(tex).not.toContain("\\section{Experience}");
        expect(tex).not.toContain("\\section{Projects}");
        expect(tex).not.toContain("\\section{Education}");
        expect(tex).not.toContain("\\section{Skills}");
        expect(tex).not.toContain("\\section{Achievements}");
    });

    it("includes a section and its content when entries are present", () => {
        const tex = buildResumeLatex({
            name: "Jane Doe",
            experience: [{ title: "Software Engineer", dateRange: "2022 -- Present", organization: "Acme", location: "Remote", bullets: ["Shipped a thing"], tech: "Python" }],
        });
        expect(tex).toContain("\\section{Experience}");
        expect(tex).toContain("Software Engineer");
        expect(tex).toContain("Shipped a thing");
        expect(tex).toContain("\\resumeTech{Python}");
    });

    it("escapes LaTeX special characters in every text field, not just the name", () => {
        const tex = buildResumeLatex({
            name: "Jane & Doe",
            summary: "Grew revenue 50% using C# & R.",
            experience: [{ title: "Eng #1", dateRange: "", organization: "Acme_Corp", location: "", bullets: ["Cut costs 20%"], tech: "" }],
        });
        expect(tex).toContain("Jane \\& Doe");
        expect(tex).toContain("50\\%");
        expect(tex).toContain("Eng \\#1");
        expect(tex).toContain("Acme\\_Corp");
        expect(tex).not.toMatch(/[^\\]&(?!\s*)/); // no raw unescaped "&" outside the fixed tabular* macros
    });

    it("turns a project link into \\href only when the URL passes sanitization, otherwise falls back to plain text", () => {
        const safe = buildResumeLatex({ name: "X", projects: [{ name: "P", links: [{ label: "GitHub", url: "https://github.com/x" }], bullets: ["b"] }] });
        expect(safe).toContain("\\href{https://github.com/x}{GitHub}");

        const unsafe = buildResumeLatex({ name: "X", projects: [{ name: "P", links: [{ label: "GitHub", url: "javascript:alert(1)" }], bullets: ["b"] }] });
        expect(unsafe).not.toContain("\\href");
        expect(unsafe).toContain("GitHub");
    });

    it("defaults the header name to \"Candidate\" when none is provided", () => {
        const tex = buildResumeLatex({});
        expect(tex).toContain("Candidate");
    });
});
