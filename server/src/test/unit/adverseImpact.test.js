import { describe, expect, it } from "vitest";
import { computeAdverseImpact } from "../../services/adverseImpact.js";

const people = (count, fields) => Array.from({ length: count }, () => ({ ...fields }));

describe("adverse impact report", () => {
    it("computes selection rates, impact ratios and the four-fifths flag", () => {
        const report = computeAdverseImpact([
            ...people(8, { sex: "female", raceEthnicity: "asian", reviewerDecision: "advance", overallScore: 8 }),
            ...people(2, { sex: "female", raceEthnicity: "asian", reviewerDecision: "reject", overallScore: 4 }),
            ...people(4, { sex: "male", raceEthnicity: "white", reviewerDecision: "advance", overallScore: 8 }),
            ...people(6, { sex: "male", raceEthnicity: "white", reviewerDecision: "reject", overallScore: 4 }),
        ]);
        const female = report.selection.sex.groups.find((group) => group.key === "female");
        const male = report.selection.sex.groups.find((group) => group.key === "male");
        expect(female).toMatchObject({ eligible: 10, favourable: 8, rate: 0.8, impactRatio: 1, flagged: false });
        expect(male).toMatchObject({ eligible: 10, favourable: 4, rate: 0.4, impactRatio: 0.5, flagged: true });
        expect(report.selection.intersectional.groups.map((group) => group.key).sort()).toEqual(["female|asian", "male|white"]);
    });

    it("uses scoring above the median as the favourable scoring outcome", () => {
        const report = computeAdverseImpact([
            ...people(5, { sex: "female", overallScore: 9 }),
            ...people(5, { sex: "male", overallScore: 3 }),
        ]);
        expect(report.scoring.median).toBe(6);
        expect(report.scoring.sex.groups.find((group) => group.key === "male")).toMatchObject({ rate: 0, impactRatio: 0, flagged: true });
    });

    it("suppresses rates for groups below the minimum size and counts non-respondents separately", () => {
        const report = computeAdverseImpact([
            ...people(6, { sex: "female", reviewerDecision: "advance", overallScore: 7 }),
            ...people(2, { sex: "nonbinary", reviewerDecision: "reject", overallScore: 5 }),
            ...people(3, { reviewerDecision: "advance", overallScore: 6 }),
        ]);
        expect(report.selection.sex.groups.find((group) => group.key === "nonbinary")).toMatchObject({ eligible: 2, rate: null, impactRatio: null, suppressed: true, flagged: false });
        expect(report.selection.sex.notProvided).toBe(3);
        expect(report.selfIdentified).toBe(8);
    });

    it("ignores unscored and undecided attempts for the respective outcome", () => {
        const report = computeAdverseImpact([
            { sex: "female", overallScore: undefined, reviewerDecision: "" },
            { sex: "female", overallScore: 5, reviewerDecision: "" },
        ]);
        expect(report.scoring.total).toBe(1);
        expect(report.selection.total).toBe(0);
    });
});
