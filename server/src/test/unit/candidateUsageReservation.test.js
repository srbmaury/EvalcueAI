import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import Organization from "../../models/Organization.js";
import CandidateUsageReservation from "../../models/CandidateUsageReservation.js";
import OrganizationUsageCounter from "../../models/OrganizationUsageCounter.js";
import { finalizeCandidateInterview, releaseOrganizationUsage, reserveCandidateInterview } from "../../services/organizationUsage.js";

let replset;

describe("candidate interview usage reservations", () => {
    beforeAll(async () => {
        if (mongoose.connection.readyState) return;
        replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
        await mongoose.connect(replset.getUri());
    }, 30000);

    afterAll(async () => {
        await CandidateUsageReservation.deleteMany({});
        await OrganizationUsageCounter.deleteMany({});
        if (replset) { await mongoose.disconnect(); await replset.stop(); }
    });

    it("finalizes a reservation idempotently without double-counting usage", async () => {
        const organization = await Organization.create({ name: "Usage Test", createdBy: new mongoose.Types.ObjectId(), hiringTrialEligible: true });
        const attemptId = new mongoose.Types.ObjectId();
        const reserved = await reserveCandidateInterview(organization._id, attemptId);
        expect(reserved.ok).toBe(true);
        expect(await finalizeCandidateInterview(reserved.reservation)).toBe(true);
        expect(await finalizeCandidateInterview(reserved.reservation)).toBe(true);
        const reservation = await CandidateUsageReservation.findById(reserved.reservation.reservationId).lean();
        const counter = await OrganizationUsageCounter.findById(reservation.counter).lean();
        expect(counter.used).toBe(1);
        expect(counter.reserved).toBe(0);
    });

    it("releases an abandoned reservation idempotently without consuming usage", async () => {
        const organization = await Organization.create({ name: "Release Test", createdBy: new mongoose.Types.ObjectId(), hiringTrialEligible: true });
        const attemptId = new mongoose.Types.ObjectId();
        const reserved = await reserveCandidateInterview(organization._id, attemptId);
        expect(reserved.ok).toBe(true);
        expect(await releaseOrganizationUsage(reserved.reservation)).toBe(true);
        expect(await releaseOrganizationUsage(reserved.reservation)).toBe(true);
        const reservation = await CandidateUsageReservation.findById(reserved.reservation.reservationId).lean();
        const counter = await OrganizationUsageCounter.findById(reservation.counter).lean();
        expect(counter.used).toBe(0);
        expect(counter.reserved).toBe(0);
    });
});
