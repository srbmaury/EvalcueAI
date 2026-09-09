import { describe, expect, it } from "vitest";
import { buildWeeklyPracticePlan } from "../../services/weeklyPracticePlan.js";

describe("weekly practice plan", () => {
    it("creates the requested number of distinct backend sessions", () => {
        const sessions = buildWeeklyPracticePlan({
            targetRole: "Senior Backend Engineer",
            weeklyPracticeTarget: 3,
            preferredProgrammingLanguage: "java",
            practiceGoal: "switch-role",
        });

        expect(sessions).toHaveLength(3);
        expect(sessions.map((session) => session.title)).toEqual([
            "Senior Backend Engineer — System design",
            "Senior Backend Engineer — Backend coding",
            "Senior Backend Engineer — Backend behavioral",
        ]);
        expect(sessions[0].jobDescription).toContain("senior-level practice interview");
        expect(sessions[1].jobDescription).toContain("Use Java");
        expect(sessions[2].jobDescription).toContain("transferable experience");
    });

    it("clamps weekly plans to the supported one-to-seven range", () => {
        expect(buildWeeklyPracticePlan({ weeklyPracticeTarget: 0 })).toHaveLength(3);
        expect(buildWeeklyPracticePlan({ weeklyPracticeTarget: 99 })).toHaveLength(7);
        expect(buildWeeklyPracticePlan({ weeklyPracticeTarget: 1 })).toHaveLength(1);
    });

    it("selects a mobile-specific plan for mobile roles", () => {
        const sessions = buildWeeklyPracticePlan({ targetRole: "Senior Android Engineer", weeklyPracticeTarget: 2 });
        expect(sessions[0].title).toContain("Mobile architecture");
        expect(sessions[0].focus).toContain("offline-first");
        expect(sessions[1].title).toContain("Mobile coding");
    });
});
