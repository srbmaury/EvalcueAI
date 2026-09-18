import { describe, expect, it } from "vitest";
import { publicResume } from "../../services/resumeAccess.js";

describe("public resume metadata", () => {
    it("does not expose storage URLs or signed query credentials", () => {
        const result = publicResume({}, {
            _id: "507f1f77bcf86cd799439011",
            user: "507f191e810c19729de860ea",
            fileUrl: "https://res.cloudinary.com/private",
            publicId: "resumes/private",
            deliveryType: "authenticated",
            extractedText: "secret",
        });
        expect(result.fileUrl).toBe("/api/resumes/507f1f77bcf86cd799439011/file");
        expect(JSON.stringify(result)).not.toContain("cloudinary");
    });
});
