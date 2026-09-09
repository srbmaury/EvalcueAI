import { describe, expect, it } from "vitest";
import { publicResume, verifyResumeFileToken } from "../../services/resumeAccess.js";

describe("resume delivery access", () => {
    it("replaces storage details with an authenticated application path", () => {
        const resume = {
            _id: "507f1f77bcf86cd799439011",
            user: "507f191e810c19729de860ea",
            fileUrl: "https://res.cloudinary.com/private-storage-url",
            publicId: "resumes/secret",
            deliveryType: "authenticated",
            extractedText: "private resume contents",
            fileName: "resume.pdf",
            fileType: "application/pdf",
        };
        const safe = publicResume({}, resume);
        expect(safe.fileUrl).toBe("/api/resumes/507f1f77bcf86cd799439011/file");
        expect(safe.fileUrl).not.toContain("cloudinary");
        expect(safe.fileUrl).not.toContain("signature=");
        expect(safe.publicId).toBeUndefined();
        expect(safe.deliveryType).toBeUndefined();
        expect(safe.extractedText).toBeUndefined();
    });

    it("fails closed for retired signed resume tokens", () => {
        const resume = { _id: "507f1f77bcf86cd799439011", user: "507f191e810c19729de860ea" };
        expect(verifyResumeFileToken(resume, Math.floor(Date.now() / 1000) + 60, "legacy-signature")).toBe(false);
    });
});
