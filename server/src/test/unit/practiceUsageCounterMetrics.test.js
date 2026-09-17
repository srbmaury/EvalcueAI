import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import PracticeUsageCounter from "../../models/PracticeUsageCounter.js";
import { PRACTICE_PLAN_LIMITS } from "../../services/practiceEntitlements.js";

// Regression test for a real bug: adding a new practice usage-limit metric (e.g.
// resumeGenerationsPerMonth in PRACTICE_PLAN_LIMITS + a practiceUsageLimit(metric, ...)
// call on a route) without also adding that metric name to PracticeUsageCounter's schema
// enum. That combination passes every mocked unit test (they stub the model), builds and
// lints cleanly, and only fails at request time with a Mongoose ValidationError — which
// is exactly what happened here and surfaced as an opaque 500 on the real generate-resume
// endpoint. Schema validation runs synchronously in-memory (no DB needed), so this check
// is both fast and would have caught it immediately.
describe("PracticeUsageCounter metric enum stays in sync with PRACTICE_PLAN_LIMITS", () => {
    const metricNamesFromLimits = Object.keys(PRACTICE_PLAN_LIMITS.free)
        .filter((key) => key.endsWith("PerMonth"))
        .map((key) => key.slice(0, -"PerMonth".length));

    it("derives at least one metric name from PRACTICE_PLAN_LIMITS (sanity-checks this test itself isn't vacuous)", () => {
        expect(metricNamesFromLimits.length).toBeGreaterThan(0);
    });

    it.each(metricNamesFromLimits)("accepts metric \"%s\" without a validation error", (metric) => {
        const doc = new PracticeUsageCounter({ user: new mongoose.Types.ObjectId(), metric, period: "2026-01", used: 0 });
        const error = doc.validateSync();
        expect(error).toBeUndefined();
    });

    it("has no enum values left over that PRACTICE_PLAN_LIMITS no longer defines (catches typos/renames)", () => {
        const enumValues = PracticeUsageCounter.schema.path("metric").enumValues;
        expect(enumValues.sort()).toEqual([...metricNamesFromLimits].sort());
    });
});
