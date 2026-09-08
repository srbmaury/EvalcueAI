import { describe, expect, it } from "vitest";
import { resumeFileError } from "../utils/resumeFileValidation";

const makeFile = (overrides = {}) => ({
    name: "resume.pdf",
    type: "application/pdf",
    size: 1024,
    ...overrides,
});

describe("resumeFileValidation", () => {
    it("accepts PDF resumes within the configured size limit", () => {
        expect(resumeFileError(makeFile())).toBe("");
    });

    it("rejects non-PDF uploads", () => {
        expect(resumeFileError(makeFile({ name: "resume.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }))).toBe("Please choose a PDF file.");
    });

    it("rejects files larger than the max resume size", () => {
        expect(resumeFileError(makeFile({ size: 6 * 1024 * 1024 }))).toBe("The file must be 5 MB or smaller.");
    });
});
