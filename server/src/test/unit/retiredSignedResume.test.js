import { describe, expect, it } from "vitest";
import { resumeFileUrl } from "../../services/resumeAccess.js";

describe("retired signed resume links", () => {
    it("returns only the authenticated application path", () => {
        const url = resumeFileUrl({}, { _id: "507f1f77bcf86cd799439011" });
        expect(url).toBe("/api/resumes/507f1f77bcf86cd799439011/file");
        expect(url).not.toMatch(/[?&](signature|expires)=/);
    });
});
