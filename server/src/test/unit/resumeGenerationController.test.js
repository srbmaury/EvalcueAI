import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    findOne: vi.fn(),
    generateJSON: vi.fn(),
    compileLatexToPdf: vi.fn(),
}));

vi.mock("../../models/Resume.js", () => ({ default: { findOne: mocks.findOne } }));
vi.mock("../../utils/generateQuestions/aiClient.js", () => ({ generateJSON: mocks.generateJSON }));
vi.mock("../../utils/compileLatex.js", async () => {
    const actual = await vi.importActual("../../utils/compileLatex.js");
    return { ...actual, compileLatexToPdf: mocks.compileLatexToPdf };
});

const { generateTailoredResume } = await import("../../controllers/resumeGenerationController.js");
const { LatexCompileError } = await import("../../utils/compileLatex.js");

const response = () => ({
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
});

const validContent = {
    name: "Jane Doe",
    contact: { email: "jane@example.com" },
    summary: "Experienced engineer.",
    experience: [{ title: "Engineer", dateRange: "2022 -- Present", organization: "Acme", location: "", bullets: ["Shipped features"], tech: "Python" }],
    projects: [],
    education: [],
    skills: [],
    achievements: [],
};

beforeEach(() => {
    vi.clearAllMocks();
    mocks.findOne.mockResolvedValue({ _id: "resume1", user: "user1", extractedText: "Jane Doe's resume text with relevant experience." });
    mocks.generateJSON.mockResolvedValue(JSON.stringify(validContent));
    mocks.compileLatexToPdf.mockResolvedValue({ pdfBuffer: Buffer.from("%PDF-fake"), pageCount: 1, fillFraction: 0.9 });
});

const baseReq = () => ({ params: { id: "resume1" }, body: { role: "Software Engineer", jobDescription: "Build and ship reliable backend systems." }, user: { _id: "user1" } });

describe("generateTailoredResume", () => {
    it("returns a compiled PDF with a page-count header on the happy path", async () => {
        const req = baseReq();
        const res = response();
        await generateTailoredResume(req, res, vi.fn());

        expect(mocks.findOne).toHaveBeenCalledWith({ _id: "resume1", user: "user1" });
        expect(mocks.compileLatexToPdf).toHaveBeenCalledTimes(1);
        expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/pdf");
        expect(res.setHeader).toHaveBeenCalledWith("X-Resume-Page-Count", "1");
        expect(res.send).toHaveBeenCalledWith(Buffer.from("%PDF-fake"));
    });

    it("returns 404 when the resume does not belong to the requesting user", async () => {
        mocks.findOne.mockResolvedValueOnce(null);
        const req = baseReq();
        const res = response();
        await generateTailoredResume(req, res, vi.fn());
        expect(res.status).toHaveBeenCalledWith(404);
        expect(mocks.compileLatexToPdf).not.toHaveBeenCalled();
    });

    it("re-prompts the AI to condense content when the first compile produces more than one page, and recompiles", async () => {
        mocks.compileLatexToPdf
            .mockResolvedValueOnce({ pdfBuffer: Buffer.from("page1-and-2"), pageCount: 2 })
            .mockResolvedValueOnce({ pdfBuffer: Buffer.from("fits-one-page"), pageCount: 1 });

        const req = baseReq();
        const res = response();
        await generateTailoredResume(req, res, vi.fn());

        expect(mocks.generateJSON).toHaveBeenCalledTimes(2); // initial generation + one condense pass
        expect(mocks.compileLatexToPdf).toHaveBeenCalledTimes(2);
        expect(res.setHeader).toHaveBeenCalledWith("X-Resume-Page-Count", "1");
        expect(res.send).toHaveBeenCalledWith(Buffer.from("fits-one-page"));
    });

    it("stops retrying after the attempt cap and still returns the last compiled PDF even if it never fit one page", async () => {
        mocks.compileLatexToPdf.mockResolvedValue({ pdfBuffer: Buffer.from("still-two-pages"), pageCount: 2 });

        const req = baseReq();
        const res = response();
        await generateTailoredResume(req, res, vi.fn());

        expect(mocks.compileLatexToPdf).toHaveBeenCalledTimes(4); // MAX_COMPILE_ATTEMPTS
        expect(res.setHeader).toHaveBeenCalledWith("X-Resume-Page-Count", "2");
        expect(res.send).toHaveBeenCalledWith(Buffer.from("still-two-pages"));
    });

    it("re-prompts the AI to expand content when the page fits but is mostly empty, and recompiles", async () => {
        mocks.compileLatexToPdf
            .mockResolvedValueOnce({ pdfBuffer: Buffer.from("sparse-page"), pageCount: 1, fillFraction: 0.3 })
            .mockResolvedValueOnce({ pdfBuffer: Buffer.from("fuller-page"), pageCount: 1, fillFraction: 0.85 });

        const req = baseReq();
        const res = response();
        await generateTailoredResume(req, res, vi.fn());

        expect(mocks.generateJSON).toHaveBeenCalledTimes(2); // initial generation + one expand pass
        const expandPrompt = mocks.generateJSON.mock.calls[1][0];
        expect(expandPrompt).toContain("empty space at the bottom");
        expect(expandPrompt).toContain(validContent.experience[0].title); // carries prior content forward
        expect(mocks.compileLatexToPdf).toHaveBeenCalledTimes(2);
        expect(res.setHeader).toHaveBeenCalledWith("X-Resume-Page-Count", "1");
        expect(res.send).toHaveBeenCalledWith(Buffer.from("fuller-page"));
    });

    it("does not attempt to expand when the fill fraction could not be measured", async () => {
        mocks.compileLatexToPdf.mockResolvedValue({ pdfBuffer: Buffer.from("unmeasured-page"), pageCount: 1, fillFraction: null });

        const req = baseReq();
        const res = response();
        await generateTailoredResume(req, res, vi.fn());

        expect(mocks.compileLatexToPdf).toHaveBeenCalledTimes(1);
        expect(mocks.generateJSON).toHaveBeenCalledTimes(1); // only the initial generation, no expand pass
        expect(res.send).toHaveBeenCalledWith(Buffer.from("unmeasured-page"));
    });

    it("stops expanding after the attempt cap and still returns the last compiled PDF even if it never fills the page", async () => {
        mocks.compileLatexToPdf.mockResolvedValue({ pdfBuffer: Buffer.from("still-sparse"), pageCount: 1, fillFraction: 0.2 });

        const req = baseReq();
        const res = response();
        await generateTailoredResume(req, res, vi.fn());

        expect(mocks.compileLatexToPdf).toHaveBeenCalledTimes(4); // MAX_COMPILE_ATTEMPTS
        expect(res.send).toHaveBeenCalledWith(Buffer.from("still-sparse"));
    });

    it("returns 503 without compiling when the AI produces no usable content", async () => {
        mocks.generateJSON.mockResolvedValueOnce("");
        const req = baseReq();
        const res = response();
        await generateTailoredResume(req, res, vi.fn());
        expect(res.status).toHaveBeenCalledWith(503);
        expect(mocks.compileLatexToPdf).not.toHaveBeenCalled();
    });

    it("returns 503 when the LaTeX compiler binary itself is unavailable on the server", async () => {
        mocks.compileLatexToPdf.mockRejectedValueOnce(new LatexCompileError("The resume compiler is not available on this server.", { unavailable: true }));
        const req = baseReq();
        const res = response();
        await generateTailoredResume(req, res, vi.fn());
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith({ message: "The resume compiler is not available on this server." });
    });

    it("returns 422 when the generated LaTeX fails to compile for a content reason", async () => {
        mocks.compileLatexToPdf.mockRejectedValueOnce(new LatexCompileError("LaTeX compilation failed: some detail"));
        const req = baseReq();
        const res = response();
        await generateTailoredResume(req, res, vi.fn());
        expect(res.status).toHaveBeenCalledWith(422);
    });

    it("caps oversized AI-supplied arrays instead of trusting them directly", async () => {
        mocks.generateJSON.mockResolvedValueOnce(JSON.stringify({
            ...validContent,
            experience: Array.from({ length: 20 }, (_, i) => ({ title: `Job ${i}`, bullets: ["b"] })),
        }));
        const req = baseReq();
        const res = response();
        await generateTailoredResume(req, res, vi.fn());
        const texArg = mocks.compileLatexToPdf.mock.calls[0][0];
        const jobCount = (texArg.match(/Job \d+/g) || []).length;
        expect(jobCount).toBeLessThanOrEqual(12);
    });
});
