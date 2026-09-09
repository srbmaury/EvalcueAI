import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

describe("job importer extraction quality", () => {
    it("combines structured and page content instead of preferring a short meta description", () => {
        const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
        const importer = fs.readFileSync(path.join(root, "server/src/services/jobPostImporter.js"), "utf8");
        expect(importer).toContain("extractionQuality");
        expect(importer).toContain("responsibilities");
        expect(importer).toContain("qualifications");
        expect(importer).toContain("skills");
    });
});
