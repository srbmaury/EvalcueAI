import { execFile } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { PDFParse } from "pdf-parse";

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

/**
 * Compiles a .tex source string to a PDF buffer using Tectonic, in an isolated temp
 * directory that's always cleaned up. Returns the PDF bytes and its page count (via
 * pdf-parse, already a dependency for resume uploads — no new package needed).
 */
export const compileLatexToPdf = async (texSource) => {
    const workDir = await mkdtemp(path.join(os.tmpdir(), "resume-latex-"));
    try {
        const texFileName = "resume.tex";
        await writeFile(path.join(workDir, texFileName), texSource, "utf8");
        await runTectonic(workDir, texFileName);
        const pdfBuffer = await readFile(path.join(workDir, "resume.pdf"));
        const parser = new PDFParse({ data: pdfBuffer });
        let pageCount;
        try {
            const parsed = await parser.getText();
            pageCount = parsed.total;
        } finally {
            await parser.destroy();
        }
        return { pdfBuffer, pageCount };
    } finally {
        await rm(workDir, { recursive: true, force: true });
    }
};
