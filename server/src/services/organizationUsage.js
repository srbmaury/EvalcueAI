import mongoose from "mongoose";
import Organization from "../models/Organization.js";
import OrganizationUsageCounter from "../models/OrganizationUsageCounter.js";
import CandidateUsageReservation from "../models/CandidateUsageReservation.js";
import { hiringLimitsFor, hiringUsagePeriod } from "./hiringEntitlements.js";

const METRIC = "candidateInterviews";
const DEFAULT_RESERVATION_TTL_MS = Math.max(Number(process.env.CANDIDATE_RESERVATION_TTL_MS || 6 * 60 * 60 * 1000), 60 * 60 * 1000);
const reservationIdFrom = (reservation) => reservation?.reservationId || reservation?._id || reservation || null;

export const organizationHiringUsage = async (organizationOrId) => {
    const organization = typeof organizationOrId === "object" && organizationOrId?._id
        ? organizationOrId
        : await Organization.findById(organizationOrId);
    if (!organization) return null;
    const limits = hiringLimitsFor(organization);
    const period = hiringUsagePeriod(organization);
    const counter = await OrganizationUsageCounter.findOne({
        organization: organization._id,
        metric: METRIC,
        period: period.key,
    }).lean();
    const used = counter?.used || 0;
    const reserved = counter?.reserved || 0;
    return {
        organization,
        plan: limits.plan,
        limit: limits.candidateInterviews,
        used,
        reserved,
        remaining: Math.max(limits.candidateInterviews - used - reserved, 0),
        period,
    };
};

export const reserveCandidateInterview = async (organizationId, attemptId, { ttlMs = DEFAULT_RESERVATION_TTL_MS } = {}) => {
    if (!attemptId) throw new Error("Candidate attempt id is required for usage reservation");
    const existingReservation = await CandidateUsageReservation.findOne({ attempt: attemptId }).lean();
    if (existingReservation) {
        if (existingReservation.status === "reserved") {
            return { ok: true, reservation: { reservationId: existingReservation._id }, reused: true };
        }
        if (existingReservation.status === "finalized") {
            return { ok: true, reservation: { reservationId: existingReservation._id }, finalized: true, reused: true };
        }
    }

    const organization = await Organization.findById(organizationId);
    if (!organization) return { ok: false, reason: "organization_missing" };
    const limits = hiringLimitsFor(organization);
    const period = hiringUsagePeriod(organization);
    const limit = limits.candidateInterviews;
    if (limit <= 0) return { ok: false, reason: "capacity", plan: limits.plan, limit, period: period.key, used: 0, reserved: 0 };

    const filter = {
        organization: organization._id,
        metric: METRIC,
        period: period.key,
        $expr: {
            $lt: [
                { $add: [{ $ifNull: ["$used", 0] }, { $ifNull: ["$reserved", 0] }] },
                limit,
            ],
        },
    };
    let counter = await OrganizationUsageCounter.findOneAndUpdate(filter, { $inc: { reserved: 1 } }, { new: true });
    if (!counter) {
        try {
            counter = await OrganizationUsageCounter.create({ organization: organization._id, metric: METRIC, period: period.key, used: 0, reserved: 1 });
        } catch {
            counter = await OrganizationUsageCounter.findOneAndUpdate(filter, { $inc: { reserved: 1 } }, { new: true });
        }
    }
    if (!counter) {
        const current = await OrganizationUsageCounter.findOne({ organization: organization._id, metric: METRIC, period: period.key }).lean();
        return { ok: false, reason: "capacity", plan: limits.plan, limit, period: period.key, used: current?.used || 0, reserved: current?.reserved || 0 };
    }

    const expiresAt = new Date(Date.now() + Math.max(Number(ttlMs) || DEFAULT_RESERVATION_TTL_MS, 60 * 60 * 1000));
    try {
        const created = await CandidateUsageReservation.create({
            attempt: attemptId,
            organization: organization._id,
            counter: counter._id,
            status: "reserved",
            expiresAt,
        });
        return {
            ok: true,
            plan: limits.plan,
            limit,
            period: period.key,
            used: counter.used || 0,
            reserved: counter.reserved || 0,
            reservation: { reservationId: created._id },
        };
    } catch (error) {
        await OrganizationUsageCounter.updateOne({ _id: counter._id, reserved: { $gt: 0 } }, { $inc: { reserved: -1 } }).catch(() => {});
        if (error?.code === 11000) {
            const existing = await CandidateUsageReservation.findOne({ attempt: attemptId }).lean();
            if (existing?.status === "reserved" || existing?.status === "finalized") {
                return { ok: true, reservation: { reservationId: existing._id }, reused: true, finalized: existing.status === "finalized" };
            }
        }
        throw error;
    }
};

export const finalizeCandidateInterview = async (reservation) => {
    const reservationId = reservationIdFrom(reservation);
    if (!reservationId) return false;
    const session = await mongoose.startSession();
    try {
        let finalized = false;
        await session.withTransaction(async () => {
            const record = await CandidateUsageReservation.findById(reservationId).session(session);
            if (!record) return;
            if (record.status === "finalized") { finalized = true; return; }
            if (record.status !== "reserved") return;
            const counter = await OrganizationUsageCounter.updateOne(
                { _id: record.counter, reserved: { $gt: 0 } },
                { $inc: { reserved: -1, used: 1 } },
                { session },
            );
            if (counter.modifiedCount !== 1) throw new Error("Candidate usage reservation counter is unavailable");
            record.status = "finalized";
            record.finalizedAt = new Date();
            await record.save({ session });
            finalized = true;
        });
        return finalized;
    } finally {
        await session.endSession();
    }
};

export const releaseOrganizationUsage = async (reservation) => {
    const reservationId = reservationIdFrom(reservation);
    if (!reservationId) return false;
    const session = await mongoose.startSession();
    try {
        let released = false;
        await session.withTransaction(async () => {
            const record = await CandidateUsageReservation.findById(reservationId).session(session);
            if (!record) return;
            if (record.status === "released") { released = true; return; }
            if (record.status === "finalized") return;
            const counter = await OrganizationUsageCounter.updateOne(
                { _id: record.counter, reserved: { $gt: 0 } },
                { $inc: { reserved: -1 } },
                { session },
            );
            if (counter.modifiedCount !== 1) throw new Error("Candidate usage reservation counter is unavailable");
            record.status = "released";
            record.releasedAt = new Date();
            await record.save({ session });
            released = true;
        });
        return released;
    } finally {
        await session.endSession();
    }
};

// Frees the capacity held by an in-progress attempt that will never be submitted (ended or revoked).
export const releaseAttemptReservation = async (attemptId) => {
    const record = await CandidateUsageReservation.findOne({ attempt: attemptId, status: "reserved" }).select("_id").lean();
    return record ? releaseOrganizationUsage({ reservationId: record._id }) : false;
};

export const expiredCandidateReservations = async (now = new Date(), limit = 100) => CandidateUsageReservation.find({
    status: "reserved",
    expiresAt: { $lte: now },
}).sort({ expiresAt: 1 }).limit(limit).lean();
