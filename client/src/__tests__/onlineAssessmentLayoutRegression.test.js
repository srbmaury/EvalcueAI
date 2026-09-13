import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const interviewPage = fs.readFileSync(path.resolve("src/pages/InterviewPage.jsx"), "utf8");
const oaForm = fs.readFileSync(path.resolve("src/components/OAForm.jsx"), "utf8");

describe("online assessment layout regressions", () => {
    it("uses a theme-aware round header surface", () => {
        expect(interviewPage).toContain('bgcolor: "background.paper"');
        expect(interviewPage).not.toContain('bgcolor: "rgba(255,255,255,.94)"');
    });

    it("keeps the required camera in a dedicated workspace slot", () => {
        expect(oaForm).toContain('data-testid="online-assessment-camera-slot"');
        expect(oaForm).not.toContain("<WebcamPreview autoStart required monitorFaces />\n            </Paper>");
    });
});
