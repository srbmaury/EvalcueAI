import Organization from "../models/Organization.js";
import OrganizationUsageCounter from "../models/OrganizationUsageCounter.js";
import { hiringLimitsFor, hiringUsagePeriod } from "./hiringEntitlements.js";

const METRIC = "candidateInterviews";

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

export const reserveCandidateInterview = async (organizationId) => {
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
    let counter = await OrganizationUsageCounter.findOneAndUpdate(
        filter,
        { $inc: { reserved: 1 } },
        { new: true },
    );
    if (!counter) {
        try {
            counter = await OrganizationUsageCounter.create({
                organization: organization._id,
                metric: METRIC,
                period: period.key,
                used: 0,
                reserved: 1,
            });
        } catch {
            counter = await OrganizationUsageCounter.findOneAndUpdate(filter, { $inc: { reserved: 1 } }, { new: true });
        }
    }
    if (!counter) {
        const current = await OrganizationUsageCounter.findOne({ organization: organization._id, metric: METRIC, period: period.key }).lean();
        return {
            ok: false,
            reason: "capacity",
            plan: limits.plan,
            limit,
            period: period.key,
            used: current?.used || 0,
            reserved: current?.reserved || 0,
        };
    }

    return {
        ok: true,
        plan: limits.plan,
        limit,
        period: period.key,
        used: counter.used || 0,
        reserved: counter.reserved || 0,
        reservation: { counterId: counter._id },
    };
};

export const finalizeCandidateInterview = async (reservation) => {
    if (!reservation?.counterId) return false;
    const result = await OrganizationUsageCounter.updateOne(
        { _id: reservation.counterId, reserved: { $gt: 0 } },
        { $inc: { reserved: -1, used: 1 } },
    );
    return result.modifiedCount > 0;
};

export const releaseOrganizationUsage = async (reservation) => {
    if (!reservation?.counterId) return false;
    const result = await OrganizationUsageCounter.updateOne(
        { _id: reservation.counterId, reserved: { $gt: 0 } },
        { $inc: { reserved: -1 } },
    ).catch(() => null);
    return Boolean(result?.modifiedCount);
};
