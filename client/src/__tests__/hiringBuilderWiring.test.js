import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve("src/pages/AssessmentBuilderPage.jsx"), "utf8");

describe("hiring assessment builder wiring", () => {
    it("uses explicit assessment-timezone payload helpers instead of UTC slicing", () => {
        expect(source).toContain("buildEditableAssessmentPayload");
        expect(source).toContain("formatLocalDateTimeInput");
        expect(source).not.toContain("toISOString().slice(0, 16)");
    });

    it("shows the debugging format only through the server capability and uses its dedicated editor", () => {
        expect(source).toContain('api.get("/assessments/capabilities")');
        expect(source).toContain("debuggingAssessmentsEnabled");
        expect(source).toContain('<MenuItem value="debugging">Debugging assignment</MenuItem>');
        expect(source).toContain("<DebuggingRoundEditor");
        expect(source).toContain("createDebuggingRound");
    });

    it("tracks current debugging validation and blocks publish without restoring provisional single-file fields", () => {
        expect(source).toContain("debuggingValidations");
        expect(source).toContain("onValidationChange");
        expect(source).toContain("debuggingReadyToPublish");
        expect(source).toContain("Validate every debugging assignment before publishing or scheduling.");
        expect(source).not.toContain("starterCode");
        expect(source).not.toContain("round.debugging?.tests");
    });

    it("persists debugging validation status in the local draft alongside form and step, so a reload doesn't force re-validating an unchanged round", () => {
        // debuggingValidations previously lived only in React state: reloading mid-build (a
        // real scenario the local-draft recovery feature exists for) always showed "Validate
        // every debugging assignment before publishing" again, even for a round nobody had
        // touched since it was last validated, forcing an unnecessary re-click.
        const writeCall = source.match(/writeLocalDraft\(draftKey, \{[^}]*\}\)/);
        expect(writeCall?.[0]).toContain("debuggingValidations");
        const restoreCalls = [...source.matchAll(/setDebuggingValidations\(local\.debuggingValidations \|\| \{\}\)/g)];
        // One restore path for editing an existing assessment, one for a brand-new draft.
        expect(restoreCalls.length).toBe(2);
    });
});
