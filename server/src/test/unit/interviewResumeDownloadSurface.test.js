import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

describe("interview resume download surface", () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

    it("uses authenticated API downloads instead of opening protected file URLs", () => {
        const page = fs.readFileSync(path.join(root, "client/src/pages/InterviewPage.jsx"), "utf8");
        expect(page).toContain('api.get(`/resumes/${resumeId}/file`, { responseType: "blob" })');
        expect(page).not.toContain("window.open(resumeUrl");
    });
});
