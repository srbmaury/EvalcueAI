import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { publicResume, verifyResumeFileToken } from "../../services/resumeAccess.js";

describe("resume delivery access", () => {
    const previousJwt = process.env.JWT_SECRET;
    const previousOrigin = process.env.SERVER_ORIGIN;

    beforeEach(() => {
        process.env.JWT_SECRET = "test-resume-file-secret";
        process.env.SERVER_ORIGIN = "https://api.evalcue.test";
    });

    afterEach(() => {
        if (previousJwt === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = previousJwt;
        if (previousOrigin === undefined) delete process.env.SERVER_ORIGIN;
        else process.env.SERVER_ORIGIN = previousOrigin;
    });

    it("replaces storage details with a short-lived signed application URL", () => {
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
        const safe = publicResume({ protocol: "https", get: () => "ignored" }, resume);
        expect(safe.fileUrl).toMatch(/^https:\/\/api\.evalcue\.test\/api\/resumes\/507f1f77bcf86cd799439011\/file\?/);
        expect(safe.fileUrl).not.toContain("cloudinary");
        expect(safe.publicId).toBeUndefined();
        expect(safe.deliveryType).toBeUndefined();
        expect(safe.extractedText).toBeUndefined();

        const url = new URL(safe.fileUrl);
        expect(verifyResumeFileToken(resume, url.searchParams.get("expires"), url.searchParams.get("signature"))).toBe(true);
    });

    it("rejects expired or modified download tokens", () => {
        const resume = { _id: "507f1f77bcf86cd799439011", user: "507f191e810c19729de860ea" };
        expect(verifyResumeFileToken(resume, Math.floor(Date.now() / 1000) - 1, "invalid-signature")).toBe(false);
        expect(verifyResumeFileToken({ ...resume, _id: "507f1f77bcf86cd799439012" }, Math.floor(Date.now() / 1000) + 60, "invalid-signature")).toBe(false);
    });
});
