import mongoose from "mongoose";
import Organization from "../models/Organization.js";
import OrganizationMembership from "../models/OrganizationMembership.js";
import User from "../models/User.js";
import { activeHiringPlan } from "../services/hiringEntitlements.js";

const activeMembership = (organizationId, userId, session = null) => {
    const query = OrganizationMembership.findOne({
        organization: organizationId,
        user: userId,
        status: "active",
    });
    return session ? query.session(session) : query;
};

const organizationView = (membership, memberCount = 0) => ({
    _id: membership.organization._id,
    name: membership.organization.name,
    role: membership.role,
    memberCount,
    hiringPlan: activeHiringPlan(membership.organization),
    hiringSubscriptionStatus: membership.organization.hiringSubscriptionStatus,
    createdAt: membership.organization.createdAt,
});

const canManageMember = (actorRole, targetRole, nextRole = targetRole) => {
    if (targetRole === "owner" || nextRole === "owner") return false;
    if (actorRole === "owner") return true;
    if (actorRole !== "admin") return false;
    return targetRole !== "admin" && nextRole !== "admin";
};

export const listOrganizations = async (req, res, next) => {
    try {
        const memberships = await OrganizationMembership.find({ user: req.user._id, status: "active" })
            .sort({ createdAt: 1 })
            .populate("organization");
        const organizationIds = memberships.map((membership) => membership.organization?._id).filter(Boolean);
        const counts = organizationIds.length
            ? await OrganizationMembership.aggregate([
                { $match: { organization: { $in: organizationIds }, status: "active" } },
                { $group: { _id: "$organization", count: { $sum: 1 } } },
            ])
            : [];
        const countByOrganization = new Map(counts.map((item) => [String(item._id), item.count]));
        return res.json({
            organizations: memberships
                .filter((membership) => membership.organization)
                .map((membership) => organizationView(
                    membership,
                    countByOrganization.get(String(membership.organization._id)) || 0,
                )),
        });
    } catch (error) {
        return next(error);
    }
};

export const createOrganization = async (req, res, next) => {
    const session = await mongoose.startSession();
    try {
        let createdView = null;
        await session.withTransaction(async () => {
            const trialClaim = await User.findOneAndUpdate(
                { _id: req.user._id, hiringTrialClaimed: false },
                { $set: { hiringTrialClaimed: true } },
                { new: true, session },
            );
            const trialClaimed = Boolean(trialClaim);

            const [organization] = await Organization.create([{
                name: req.body.name,
                createdBy: req.user._id,
                hiringTrialEligible: trialClaimed,
                hiringPlan: trialClaimed ? "trial" : "none",
            }], { session });
            const [membership] = await OrganizationMembership.create([{
                organization: organization._id,
                user: req.user._id,
                role: "owner",
                status: "active",
            }], { session });
            membership.organization = organization;
            createdView = organizationView(membership, 1);
        });
        return res.status(201).json({ organization: createdView });
    } catch (error) {
        return next(error);
    } finally {
        await session.endSession();
    }
};

export const updateOrganization = async (req, res, next) => {
    try {
        const membership = await activeMembership(req.params.organizationId, req.user._id);
        if (!membership) return res.status(404).json({ message: "Organization not found" });
        if (!["owner", "admin"].includes(membership.role)) {
            return res.status(403).json({ message: "You do not have permission to update this organization" });
        }
        const organization = await Organization.findByIdAndUpdate(
            req.params.organizationId,
            { $set: { name: req.body.name } },
            { new: true },
        );
        if (!organization) return res.status(404).json({ message: "Organization not found" });
        const memberCount = await OrganizationMembership.countDocuments({ organization: organization._id, status: "active" });
        membership.organization = organization;
        return res.json({ organization: organizationView(membership, memberCount) });
    } catch (error) {
        return next(error);
    }
};

export const listMembers = async (req, res, next) => {
    try {
        const requester = await activeMembership(req.params.organizationId, req.user._id);
        if (!requester) return res.status(404).json({ message: "Organization not found" });
        if (!["owner", "admin"].includes(requester.role)) {
            return res.status(403).json({ message: "You do not have permission to view organization members" });
        }
        const memberships = await OrganizationMembership.find({
            organization: req.params.organizationId,
            status: "active",
        })
            .sort({ createdAt: 1 })
            .populate("user", "_id name email");
        return res.json({
            members: memberships.map((membership) => ({
                _id: membership._id,
                user: membership.user,
                role: membership.role,
                status: membership.status,
                joinedAt: membership.joinedAt,
            })),
        });
    } catch (error) {
        return next(error);
    }
};

export const addMember = async (req, res, next) => {
    try {
        const requester = await activeMembership(req.params.organizationId, req.user._id);
        if (!requester) return res.status(404).json({ message: "Organization not found" });
        if (!["owner", "admin"].includes(requester.role)) {
            return res.status(403).json({ message: "You do not have permission to manage this organization" });
        }
        if (requester.role === "admin" && req.body.role === "admin") {
            return res.status(403).json({ message: "Only the organization owner can add another admin" });
        }
        const user = await User.findOne({ email: req.body.email.toLowerCase().trim() });
        if (!user) return res.status(404).json({ message: "That person needs an EvalcueAI account before they can be added" });
        if (String(user._id) === String(req.user._id)) {
            return res.status(400).json({ message: "You cannot change your own organization role through Add member. Transfer ownership or ask another authorized member to manage your role." });
        }
        const membership = await OrganizationMembership.findOneAndUpdate(
            { organization: req.params.organizationId, user: user._id },
            {
                $set: { role: req.body.role, status: "active", joinedAt: new Date() },
                $setOnInsert: { organization: req.params.organizationId, user: user._id },
            },
            { upsert: true, new: true, runValidators: true },
        ).populate("user", "_id name email");
        return res.status(201).json({
            member: {
                _id: membership._id,
                user: membership.user,
                role: membership.role,
                status: membership.status,
                joinedAt: membership.joinedAt,
            },
        });
    } catch (error) {
        return next(error);
    }
};

export const updateMember = async (req, res, next) => {
    try {
        const requester = await activeMembership(req.params.organizationId, req.user._id);
        if (!requester) return res.status(404).json({ message: "Organization not found" });
        if (!["owner", "admin"].includes(requester.role)) {
            return res.status(403).json({ message: "You do not have permission to manage this organization" });
        }
        const target = await OrganizationMembership.findOne({
            _id: req.params.membershipId,
            organization: req.params.organizationId,
            status: "active",
        });
        if (!target) return res.status(404).json({ message: "Member not found" });
        if (!canManageMember(requester.role, target.role, req.body.role)) {
            return res.status(403).json({ message: "You cannot change that member's role" });
        }
        target.role = req.body.role;
        await target.save();
        return res.json({ membership: { _id: target._id, role: target.role, status: target.status } });
    } catch (error) {
        return next(error);
    }
};

export const removeMember = async (req, res, next) => {
    try {
        const requester = await activeMembership(req.params.organizationId, req.user._id);
        if (!requester) return res.status(404).json({ message: "Organization not found" });
        if (!["owner", "admin"].includes(requester.role)) {
            return res.status(403).json({ message: "You do not have permission to manage this organization" });
        }
        const target = await OrganizationMembership.findOne({
            _id: req.params.membershipId,
            organization: req.params.organizationId,
            status: "active",
        });
        if (!target) return res.status(404).json({ message: "Member not found" });
        if (!canManageMember(requester.role, target.role)) {
            return res.status(403).json({ message: "You cannot remove that member" });
        }
        target.status = "disabled";
        await target.save();
        return res.json({ message: "Member removed" });
    } catch (error) {
        return next(error);
    }
};

export const transferOwnership = async (req, res, next) => {
    const session = await mongoose.startSession();
    try {
        let ownerMembershipId = null;
        await session.withTransaction(async () => {
            const requester = await activeMembership(req.params.organizationId, req.user._id, session);
            if (!requester) {
                const error = new Error("Organization not found");
                error.statusCode = 404;
                throw error;
            }
            if (requester.role !== "owner") {
                const error = new Error("Only the organization owner can transfer ownership");
                error.statusCode = 403;
                throw error;
            }
            const target = await OrganizationMembership.findOne({
                _id: req.body.membershipId,
                organization: req.params.organizationId,
                status: "active",
            }).session(session);
            if (!target) {
                const error = new Error("Member not found");
                error.statusCode = 404;
                throw error;
            }
            if (String(target.user) === String(req.user._id)) {
                const error = new Error("Choose another active organization member");
                error.statusCode = 400;
                throw error;
            }
            requester.role = "admin";
            target.role = "owner";
            await requester.save({ session });
            await target.save({ session });
            ownerMembershipId = target._id;
        });
        return res.json({ message: "Ownership transferred", ownerMembershipId });
    } catch (error) {
        if (error?.statusCode) return res.status(error.statusCode).json({ message: error.message });
        return next(error);
    } finally {
        await session.endSession();
    }
};
