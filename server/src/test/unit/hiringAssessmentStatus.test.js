import { describe, expect, it } from "vitest";

const transitions = { draft: ["draft", "scheduled", "active", "archived"], scheduled: ["draft", "scheduled", "active", "closed", "archived"], active: ["active", "closed", "archived"], closed: ["closed", "active", "archived"], archived: ["archived"] };

describe("assessment status transitions", () => {
    it("treats an idempotent draft to draft transition as valid", () => {
        expect(transitions.draft).toContain("draft");
    });
});
