import { describe, expect, it } from "vitest";
import {
    applyEditableAssessmentFields,
    canTransitionAssessmentStatus,
    hasEditableAssessmentContent,
} from "../../utils/hiringAssessmentUpdatePolicy.js";

describe("hiring assessment update policy", () => {
    it("recognizes a draft payload with content as a content update", () => {
        expect(hasEditableAssessmentContent({ status: "draft", title: "New title" })).toBe(true);
        expect(hasEditableAssessmentContent({ status: "draft" })).toBe(false);
    });

    it("treats same-status transitions as idempotent", () => {
        expect(canTransitionAssessmentStatus("draft", "draft")).toBe(true);
        expect(canTransitionAssessmentStatus("active", "active")).toBe(true);
    });

    it("keeps invalid lifecycle transitions blocked", () => {
        expect(canTransitionAssessmentStatus("active", "draft")).toBe(false);
        expect(canTransitionAssessmentStatus("archived", "active")).toBe(false);
    });

    it("applies only editable fields and clears optional dates", () => {
        const assessment = { title: "Old", status: "draft", shareToken: "secret", expiresAt: new Date() };
        applyEditableAssessmentFields(assessment, { title: "New", status: "active", shareToken: "changed", expiresAt: null });
        expect(assessment.title).toBe("New");
        expect(assessment.status).toBe("draft");
        expect(assessment.shareToken).toBe("secret");
        expect(assessment.expiresAt).toBeUndefined();
    });
});
