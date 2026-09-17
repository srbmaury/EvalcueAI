import { existsSync } from "fs";
import { describe, expect, it } from "vitest";
import { compileLatexToPdf, firstPageFillFraction, LatexCompileError } from "../../utils/compileLatex.js";

// These exercise the real subprocess path (not mocked) since the whole point of this
// module is the boundary with an external binary. They're skipped in environments
// without the compiler installed rather than failing CI for an infra reason unrelated
// to the code under test — see the deployment note in compileLatex.js's module comment.
const hasTectonic = existsSync("/opt/homebrew/bin/tectonic") || existsSync("/usr/local/bin/tectonic") || existsSync("/usr/bin/tectonic");
const describeIfAvailable = hasTectonic ? describe : describe.skip;

// pagestyle{empty} matters here, not just for parity with the real resume template: the
// default article pagestyle prints a centered page number at the very bottom of the page,
// which firstPageFillFraction would (correctly) count as "content near the bottom",
// making a nearly-blank page look artificially full.
const minimalTex = String.raw`\documentclass{article}
\pagestyle{empty}
\begin{document}
Hello, world.
\end{document}
`;

describeIfAvailable("compileLatexToPdf (real Tectonic binary)", () => {
    it("compiles a minimal document to a one-page PDF", async () => {
        const { pdfBuffer, pageCount } = await compileLatexToPdf(minimalTex);
        expect(pageCount).toBe(1);
        expect(pdfBuffer.subarray(0, 4).toString()).toBe("%PDF");
    });

    it("throws a LatexCompileError (not unavailable) for invalid LaTeX source", async () => {
        await expect(compileLatexToPdf("\\this is not valid latex at all {{{")).rejects.toThrow(LatexCompileError);
    });

    it("reports a low fill fraction for a page with one short line near the top", async () => {
        const { fillFraction } = await compileLatexToPdf(minimalTex);
        expect(fillFraction).not.toBeNull();
        expect(fillFraction).toBeLessThan(0.25);
    });

    it("reports a high fill fraction for a page whose content runs most of the way down", async () => {
        const longTex = String.raw`\documentclass{article}\pagestyle{empty}\usepackage[margin=1in]{geometry}\begin{document}
${Array.from({ length: 45 }, (_, i) => `Line number ${i + 1} of filler text to occupy vertical space.\\\\`).join("\n")}
\end{document}
`;
        const { pageCount, fillFraction } = await compileLatexToPdf(longTex);
        expect(pageCount).toBe(1);
        expect(fillFraction).not.toBeNull();
        expect(fillFraction).toBeGreaterThan(0.75);
    });
});

describe("firstPageFillFraction", () => {
    it("returns null instead of throwing when given bytes that aren't a valid PDF", async () => {
        await expect(firstPageFillFraction(Buffer.from("not a pdf"))).resolves.toBeNull();
    });
});

describe("compileLatexToPdf when the compiler binary is missing", () => {
    it("throws a LatexCompileError flagged as unavailable instead of an opaque ENOENT", async () => {
        const originalBinary = process.env.TECTONIC_BINARY;
        process.env.TECTONIC_BINARY = "/definitely/not/a/real/tectonic/binary";
        try {
            await expect(compileLatexToPdf(minimalTex)).rejects.toMatchObject({
                name: "LatexCompileError",
                unavailable: true,
            });
        } finally {
            if (originalBinary === undefined) delete process.env.TECTONIC_BINARY;
            else process.env.TECTONIC_BINARY = originalBinary;
        }
    });
});
