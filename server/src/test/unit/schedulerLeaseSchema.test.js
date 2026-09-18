import { describe, expect, it } from "vitest";
import SchedulerLease from "../../models/SchedulerLease.js";

describe("scheduler lease schema", () => {
    it("keeps one lease row per lifecycle key", () => {
        expect(SchedulerLease.schema.path("key").options.unique).toBe(true);
        expect(SchedulerLease.schema.path("expiresAt")).toBeTruthy();
    });
});
