import { describe, expect, it } from "vitest";
import { escapeLatex, sanitizeLatexUrl } from "../../utils/latexEscape.js";

describe("escapeLatex", () => {
    it("escapes every LaTeX special character", () => {
        expect(escapeLatex("100% & $x^2$ {a_b} #1 \\cmd ~tilde"))
            .toBe("100\\% \\& \\$x\\textasciicircum{}2\\$ \\{a\\_b\\} \\#1 \\textbackslash{}cmd \\textasciitilde{}tilde");
    });

    it("neutralizes an attempted shell-escape / file-read injection as inert text", () => {
        const evil = "\\write18{rm -rf /} \\input{/etc/passwd}";
        const escaped = escapeLatex(evil);
        expect(escaped).not.toContain("\\write18{");
        expect(escaped).not.toContain("\\input{");
        expect(escaped).toBe("\\textbackslash{}write18\\{rm -rf /\\} \\textbackslash{}input\\{/etc/passwd\\}");
    });

    it("passes through plain text unchanged", () => {
        expect(escapeLatex("Built reliable systems and led a team of 4 engineers.")).toBe("Built reliable systems and led a team of 4 engineers.");
    });

    it("treats null/undefined as empty string", () => {
        expect(escapeLatex(null)).toBe("");
        expect(escapeLatex(undefined)).toBe("");
    });
});

describe("sanitizeLatexUrl", () => {
    it("accepts a plain https URL", () => {
        expect(sanitizeLatexUrl("https://github.com/srbmaury")).toBe("https://github.com/srbmaury");
    });

    it("accepts a mailto URL", () => {
        expect(sanitizeLatexUrl("mailto:a@b.com")).toBe("mailto:a@b.com");
    });

    it("rejects a URL containing LaTeX brace/backslash/percent characters instead of escaping them", () => {
        expect(sanitizeLatexUrl("https://evil.com/{\\input{/etc/passwd}}")).toBe("");
        expect(sanitizeLatexUrl("https://evil.com/%0a")).toBe("");
    });

    it("rejects a non-URL string", () => {
        expect(sanitizeLatexUrl("not a url at all")).toBe("");
        expect(sanitizeLatexUrl("javascript:alert(1)")).toBe("");
    });

    it("returns empty string for empty input", () => {
        expect(sanitizeLatexUrl("")).toBe("");
        expect(sanitizeLatexUrl(undefined)).toBe("");
    });
});
