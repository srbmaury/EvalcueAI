import Interview from "../models/Interview.js";
import Round from "../models/Round.js";
import mongoose from "mongoose";
import Resume from "../models/Resume.js";
import { getCompanyGrounding } from "../services/companyGrounding.js";

export const createInterview = async (req, res, next) => {
    const { resumeId, company, jobRole, jobDescription, rounds } = req.body;

    if (!jobRole || !jobDescription || !Array.isArray(rounds) || rounds.length === 0) {
        return res.status(400).json({ message: "Role, job description, and at least one round are required" });
    }

    const companyName = (company || "").toString().trim() || "Open role";
    const grounding = await getCompanyGrounding(company ? companyName : "", jobRole);
    const session = await mongoose.startSession();
    session.startTransaction();
    const ops = [];
    try {
        const ownedResume = resumeId ? await Resume.exists({ _id: resumeId, user: req.user._id }).session(session) : null;
        if (resumeId && !ownedResume) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: "Resume not found" });
        }
        const roundDocs = await Round.insertMany(
            rounds.map((r) => ({
                name: r.roundName,
                description: r.description,
                deliveryMode: r.deliveryMode === "online-assessment" ? "online-assessment" : "conversational",
                questionLimit: Math.min(Math.max(Number(r.questionLimit) || 8, 1), 20),
                skills: Array.isArray(r.skills) ? r.skills.slice(0, 6) : [],
                rationale: (r.rationale || "").toString().slice(0, 300),
                recommended: r.recommended !== false,
                adaptiveState: { enabled: false },
                questions: [],
            })),
            { session }
        );

        if (roundDocs.length > 1) {
            for (let i = 0; i < roundDocs.length - 1; i++) {
                ops.push({
                    updateOne: {
                        filter: { _id: roundDocs[i]._id },
                        update: { $set: { nextRound: roundDocs[i + 1]._id } },
                    },
                });
            }
        }

        if (ops.length > 0) await Round.bulkWrite(ops, { session });

        const interview = await Interview.create(
            [{
                user: req.user._id,
                resume: resumeId || null,
                company: companyName,
                jobRole,
                jobDescription,
                grounding,
                rounds: roundDocs.map((r) => ({ round: r._id })),
            }],
            { session }
        );

        await session.commitTransaction();
        session.endSession();
        return res.status(201).json(interview[0]);
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("Error creating interview with rounds:", error);
        return next(error instanceof Error ? error : new Error(String(error)));
    }
};

export const getInterviews = async (req, res, next) => {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
        const status = ["completed", "in_progress"].includes(req.query.status) ? req.query.status : "all";
        const filter = { user: req.user._id };
        const paginationRequested = typeof req.query.page !== "undefined" || typeof req.query.limit !== "undefined";
        const itemsRaw = await Interview.find(filter)
            .sort({ createdAt: -1 })
            .populate({ path: "rounds.round", select: "status" })
            .lean();

        const withProgress = (itemsRaw || []).map((it) => {
            try {
                const rounds = Array.isArray(it?.rounds) ? it.rounds : [];
                const totalRounds = rounds.length;
                const completed = rounds.reduce((acc, r) => acc + (r?.round?.status === "completed" ? 1 : 0), 0);
                return { ...it, roundsCompleted: completed, roundsTotal: totalRounds, isCompleted: totalRounds > 0 && completed === totalRounds };
            } catch {
                return { ...it, roundsCompleted: 0, roundsTotal: 0, isCompleted: false };
            }
        });
        const items = withProgress.filter((item) => status === "all" ? true : status === "completed" ? item.isCompleted : !item.isCompleted);
        const total = items.length;

        if (!paginationRequested) return res.status(200).json(items);
        const totalPages = Math.max(Math.ceil(total / limit), 1);
        const pageItems = items.slice((page - 1) * limit, page * limit);
        return res.status(200).json({ items: pageItems, total, page, limit, totalPages });
    } catch (error) {
        return next(error instanceof Error ? error : new Error(String(error)));
    }
};

export const getProgressSummary = async (req, res, next) => {
    try {
        const interviews = await Interview.find({ user: req.user._id })
            .sort({ createdAt: 1 })
            .populate({ path: "rounds.round", select: "name status adaptiveState questions", populate: { path: "questions.feedback", select: "score competencies" } })
            .lean();
        const scored = [];
        const skillScores = new Map();
        let completed = 0;
        for (const interview of interviews) {
            const rounds = (interview.rounds || []).map((entry) => entry.round).filter(Boolean);
            if (rounds.length && rounds.every((round) => round.status === "completed")) completed += 1;
            const scores = rounds.flatMap((round) => (round.questions || []).map((item) => Number(item.feedback?.score)).filter(Number.isFinite));
            for (const round of rounds) {
                let addedCompetencyEvidence = false;
                for (const item of round.questions || []) {
                    for (const competency of item?.feedback?.competencies || []) {
                        const value = Number(competency?.score);
                        const name = (competency?.name || "").toString().trim();
                        if (!name || !Number.isFinite(value)) continue;
                        skillScores.set(name, [...(skillScores.get(name) || []), value]);
                        addedCompetencyEvidence = true;
                    }
                }
                if (!addedCompetencyEvidence) {
                    const values = (round.questions || []).map((item) => Number(item.feedback?.score)).filter(Number.isFinite);
                    if (values.length) {
                        const name = (round.name || "General").toString();
                        skillScores.set(name, [...(skillScores.get(name) || []), ...values]);
                    }
                }
            }
            if (scores.length) scored.push({ date: interview.createdAt, score: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 });
        }
        const averageScore = scored.length ? Math.round((scored.reduce((sum, item) => sum + item.score, 0) / scored.length) * 10) / 10 : 0;
        const recent = scored.slice(-5);
        const improvement = recent.length > 1 ? Math.round((recent.at(-1).score - recent[0].score) * 10) / 10 : 0;
        const skills = [...skillScores.entries()].map(([name, values]) => ({ name, score: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10, answers: values.length })).sort((a, b) => a.score - b.score);
        return res.json({ total: interviews.length, completed, averageScore, improvement, recent, skills, focusArea: skills[0] || null });
    } catch (error) {
        return next(error instanceof Error ? error : new Error(String(error)));
    }
};

export const getInterview = async (req, res, next) => {
    try {
        const interview = await Interview.findOne({ _id: req.params.id, user: req.user._id })
            .populate({
                path: "rounds.round",
                model: "Round",
                populate: [
                    { path: "questions.question", model: "Question" },
                    { path: "questions.feedback", model: "Feedback" },
                ],
            })
            .populate("resume");
        if (!interview) return res.status(404).json({ message: "Interview not found" });

        try {
            const rounds = Array.isArray(interview?.rounds) ? interview.rounds : [];
            const roundAverages = [];
            for (const r of rounds) {
                const qItems = Array.isArray(r?.round?.questions) ? r.round.questions : [];
                const scores = qItems.map((it) => Number(it?.feedback?.score)).filter((n) => Number.isFinite(n));
                if (scores.length > 0) roundAverages.push(scores.reduce((a, b) => a + b, 0) / scores.length);
            }
            const overall = roundAverages.length
                ? Math.round((roundAverages.reduce((a, b) => a + b, 0) / roundAverages.length) * 10) / 10
                : 0;
            const obj = interview.toObject();
            obj.overallScore = overall;
            return res.json(obj);
        } catch {
            return res.json(interview);
        }
    } catch (err) {
        console.error(err);
        return next(err instanceof Error ? err : new Error(String(err)));
    }
};
