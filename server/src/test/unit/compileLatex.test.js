import { existsSync } from "fs";
import { describe, expect, it } from "vitest";
import { compileLatexToPdf, LatexCompileError } from "../../utils/compileLatex.js";

// These exercise the real subprocess path (not mocked) since the whole point of this
// module is the boundary with an external binary. They're skipped in environments
// without the compiler installed rather than failing CI for an infra reason unrelated
// to the code under test — see the deployment note in compileLatex.js's module comment.
const hasTectonic = existsSync("/opt/homebrew/bin/tectonic") || existsSync("/usr/local/bin/tectonic") || existsSync("/usr/bin/tectonic");
const describeIfAvailable = hasTectonic ? describe : describe.skip;

const minimalTex = String.raw`\documentclass{article}
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
