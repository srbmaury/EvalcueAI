import crypto from "crypto";
import mongoose from "mongoose";
import Assessment from "../models/Assessment.js";
import CandidateAttempt from "../models/CandidateAttempt.js";
import CandidateSelfIdentification from "../models/CandidateSelfIdentification.js";
import { computeAdverseImpact } from "../services/adverseImpact.js";

const tokenHash = (value) => crypto.createHash("sha256").update(value).digest("hex");

// Offered only after submission, so answering can't be perceived as affecting the assessment. The answer is
// write-only: nothing returns it to the candidate, reviewers, or scoring.
export const saveCandidateSelfIdentification = async (req, res, next) => {
    try {
        const rawToken = req.get("x-attempt-token");
        if (!rawToken) return res.status(401).json({ message: "Attempt unavailable" });
        const assessment = await Assessment.findOne({ shareToken: req.params.shareToken }).select("_id organization").lean();
        if (!assessment) return res.status(404).json({ message: "Assessment unavailable" });
        const attempt = await CandidateAttempt.findOne({
            _id: req.params.attemptId,
            assessment: assessment._id,
            accessTokenHash: tokenHash(rawToken),
            status: { $in: ["evaluating", "submitted", "evaluation_failed"] },
        }).select("_id").lean();
        if (!attempt) return res.status(401).json({ message: "Attempt unavailable" });
        await CandidateSelfIdentification.updateOne(
            { attempt: attempt._id },
            { $set: { organization: assessment.organization, assessment: assessment._id, sex: req.body.sex || "", raceEthnicity: req.body.raceEthnicity || "" } },
            { upsert: true, runValidators: true },
        );
        return res.json({ saved: true });
    } catch (error) { return next(error); }
};

export const getAdverseImpactReport = async (req, res, next) => {
    try {
        const assessmentFilter = { organization: req.organizationId };
        if (req.query.assessmentId) assessmentFilter._id = new mongoose.Types.ObjectId(req.query.assessmentId);
        const assessments = await Assessment.find(assessmentFilter).select("_id title").sort({ createdAt: -1 }).lean();
        if (req.query.assessmentId && !assessments.length) return res.status(404).json({ message: "Assessment not found" });
        const assessmentIds = assessments.map((item) => item._id);

        const attempts = await CandidateAttempt.find({ assessment: { $in: assessmentIds }, status: "submitted" })
            .select("_id overallScore reviewerDecision").lean();
        const identities = await CandidateSelfIdentification.find({ attempt: { $in: attempts.map((item) => item._id) } })
            .select("attempt sex raceEthnicity").lean();
        const byAttempt = new Map(identities.map((item) => [String(item.attempt), item]));
        const rows = attempts.map((item) => {
            const identity = byAttempt.get(String(item._id));
            return { overallScore: item.overallScore, reviewerDecision: item.reviewerDecision || "", sex: identity?.sex || "", raceEthnicity: identity?.raceEthnicity || "" };
        });

        const allAssessments = req.query.assessmentId
            ? await Assessment.find({ organization: req.organizationId }).select("_id title").sort({ createdAt: -1 }).lean()
            : assessments;
        return res.json({
            generatedAt: new Date().toISOString(),
            assessmentId: req.query.assessmentId || null,
            assessments: allAssessments.map((item) => ({ _id: item._id, title: item.title })),
            ...computeAdverseImpact(rows),
        });
    } catch (error) { return next(error); }
};
