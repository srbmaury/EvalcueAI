import { describe, expect, it } from "vitest";

describe("Assessment Builder auto-title logic", () => {
    it("generates assessment name from job role and updates it as role changes", () => {
        let form = { jobRole: "", title: "" };

        const updateForm = (nextRole) => {
            form = {
              ...form,
              jobRole: nextRole,
              title: (form.title === `${form.jobRole} Assessment` || !form.title)
                ? `${nextRole} Assessment`
                : form.title,
            };
        };

        updateForm("S");
        expect(form.title).toBe("S Assessment");

        updateForm("SD");
        expect(form.title).toBe("SD Assessment");

        updateForm("SDE");
        expect(form.title).toBe("SDE Assessment");

        updateForm("SDE-I");
        expect(form.title).toBe("SDE-I Assessment");
    });

    it("stops updating title if user manually edits it", () => {
        let form = { jobRole: "", title: "" };

        const updateRole = (nextRole) => {
            form = {
              ...form,
              jobRole: nextRole,
              title: (form.title === `${form.jobRole} Assessment` || !form.title)
                ? `${nextRole} Assessment`
                : form.title,
            };
        };

        const updateTitle = (nextTitle) => {
            form = { ...form, title: nextTitle };
        };

        updateRole("SDE");
        expect(form.title).toBe("SDE Assessment");

        updateTitle("Custom Title");
        expect(form.title).toBe("Custom Title");

        updateRole("SDE-II");
        expect(form.title).toBe("Custom Title", "Should not overwrite custom title");
    });
});
