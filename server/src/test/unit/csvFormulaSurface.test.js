import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

describe("candidate CSV export", () => {
    it("neutralizes spreadsheet formula prefixes before quoting", () => {
        const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
        const page = fs.readFileSync(path.join(root, "client/src/pages/AssessmentReportPageLegacy.jsx"), "utf8");
        expect(page).toContain("quoteCsvCell");
        expect(page).toContain('/^[\\t\\r\\n ]*[=+\\-@]/');
        expect(page).toContain("text = `'${text}`");
        expect(page).toContain("row.map(quoteCsvCell)");
    });
});
