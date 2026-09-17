import { execFile } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { PDFParse } from "pdf-parse";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const COMPILE_TIMEOUT_MS = 30000;
// Read fresh on every call (not cached at module load) so it can be reconfigured at
// runtime without a process restart, and so tests can point it at a nonexistent path.
const tectonicBinary = () => process.env.TECTONIC_BINARY || "tectonic";

export class LatexCompileError extends Error {
    constructor(message, { unavailable = false } = {}) {
        super(message);
        this.name = "LatexCompileError";
        this.unavailable = unavailable;
    }
}

// execFile (not exec/spawn-with-shell) so the .tex content never passes through a shell —
// there is no command string for anything to inject into, only argv entries. Tectonic
// itself also has no --shell-escape / \write18 support at all (unlike a full pdflatex/
// xelatex TeX Live install), so even fully attacker-controlled LaTeX source can corrupt
// or fail the compile but cannot execute arbitrary commands through it.
const runTectonic = (workDir, texFileName) => new Promise((resolve, reject) => {
    execFile(
        tectonicBinary(),
        ["--outfmt", "pdf", texFileName],
        { cwd: workDir, timeout: COMPILE_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
        (error, stdout, stderr) => {
            if (error) {
                if (error.code === "ENOENT") {
                    reject(new LatexCompileError("The resume compiler is not available on this server.", { unavailable: true }));
                    return;
                }
                reject(new LatexCompileError(`LaTeX compilation failed: ${(stderr || stdout || error.message).toString().slice(0, 2000)}`));
                return;
            }
            resolve();
        },
    );
});

// How much of page 1 (top-down) actually has content on it, e.g. 0.85 means the lowest
// line of text sits 85% of the way down the page, leaving a normal-looking bottom margin.
// This is a real measurement of the compiled output, not an estimate from word/line counts
// asked of the AI beforehand — the AI has no reliable way to predict how its text will wrap
// or how much vertical space this template's spacing macros consume, so guessing a target
// line count upfront is much less accurate than compiling once and measuring what actually
// happened. Resilient by design: any failure here just means "don't know", not a hard
// error — the page it's measuring already compiled successfully, so a fill-fraction miss
// shouldn't block returning that PDF.
export const firstPageFillFraction = async (pdfBuffer) => {
    try {
        const doc = await getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
        try {
            const page = await doc.getPage(1);
            const { height } = page.getViewport({ scale: 1 });
            const { items } = await page.getTextContent();
            let lowestY = Infinity;
            for (const item of items) {
                if (!item.str || !item.str.trim()) continue;
                const y = item.transform[5];
                if (y < lowestY) lowestY = y;
            }
            if (!Number.isFinite(lowestY) || !(height > 0)) return null;
            return Math.max(0, Math.min(1, 1 - lowestY / height));
        } finally {
            await doc.destroy();
        }
    } catch {
        return null;
    }
};

/**
 * Compiles a .tex source string to a PDF buffer using Tectonic, in an isolated temp
 * directory that's always cleaned up. Returns the PDF bytes, its page count (via
 * pdf-parse, already a dependency for resume uploads), and page 1's fill fraction.
 */
export const compileLatexToPdf = async (texSource) => {
    const workDir = await mkdtemp(path.join(os.tmpdir(), "resume-latex-"));
    try {
        const texFileName = "resume.tex";
        await writeFile(path.join(workDir, texFileName), texSource, "utf8");
        await runTectonic(workDir, texFileName);
        let pdfBuffer;
        try {
            pdfBuffer = await readFile(path.join(workDir, "resume.pdf"));
        } catch (error) {
            // Tectonic reported success (exit code 0) but the PDF isn't where expected —
            // treat this the same as a compile failure rather than letting a raw ENOENT
            // propagate as an opaque 500.
            throw new LatexCompileError(`LaTeX compilation did not produce a PDF: ${error.message}`);
        }
        const parser = new PDFParse({ data: pdfBuffer });
        let pageCount;
        try {
            const parsed = await parser.getText();
            pageCount = parsed.total;
        } catch (error) {
            throw new LatexCompileError(`Compiled PDF could not be read back: ${error.message}`);
        } finally {
            await parser.destroy();
        }
        const fillFraction = await firstPageFillFraction(pdfBuffer);
        return { pdfBuffer, pageCount, fillFraction };
    } finally {
        await rm(workDir, { recursive: true, force: true });
    }
};
