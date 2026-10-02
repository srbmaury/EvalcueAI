import crypto from "crypto";
import Assessment from "../models/Assessment.js";
import CandidateAttempt from "../models/CandidateAttempt.js";
import Interview from "../models/Interview.js";
import Round from "../models/Round.js";
import { generateSystemDesignInterjection } from "../services/systemDesignInterviewer.js";
import { isValidSystemDesignDiagram, summarizeSystemDesignDiagram } from "../utils/systemDesignDiagram.js";
import { currentFollowUpFields, followUpList, pendingFollowUpFor } from "../services/followUps.js";

const tokenHash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const isSystemDesignRound = (round) => round?.deliveryMode === "system-design"
    || /system\s*design|architecture/i.test(`${round?.name || ""} ${round?.description || ""}`);
const findOwnedInterviewForRound = (userId, roundId) => Interview.findOne({ user: userId, "rounds.round": roundId }).lean();
const findPublicAssessment = (shareToken) => Assessment.findOne({
    shareToken,
    status: { $in: ["active", "closed"] },
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
});
const findAttempt = async (assessmentId, attemptId, rawToken) => rawToken
    ? CandidateAttempt.findOne({ _id: attemptId, assessment: assessmentId, accessTokenHash: tokenHash(rawToken) }).select("+accessTokenHash")
    : null;

const trimTurn = (value, max = 20000) => (value || "").toString().replace(/\s+/g, " ").trim().slice(0, max);
const candidateTranscriptFromTurns = (item) => (item?.discussionTurns || [])
    .filter((turn) => turn?.speaker === "candidate")
    .map((turn) => trimTurn(turn.text))
    .filter(Boolean)
    .join(" ")
    .trim();

const appendCandidateDelta = (item, transcript) => {
    const current = trimTurn(transcript);
    if (!current) return false;
    const previous = candidateTranscriptFromTurns(item);
    if (!previous) {
        item.discussionTurns.push({ speaker: "candidate", text: current, kind: "discussion", at: new Date() });
        return true;
    }
    if (current === previous) return false;
    let delta = "";
    if (current.startsWith(previous)) {
        delta = current.slice(previous.length).trim();
    } else {
        let common = 0;
        const limit = Math.min(previous.length, current.length);
        while (common < limit && previous[common] === current[common]) common += 1;
        delta = current.slice(common).trim();
    }
    if (!delta) return false;
    item.discussionTurns.push({ speaker: "candidate", text: delta.slice(0, 20000), kind: "discussion", at: new Date() });
    if (item.discussionTurns.length > 80) item.discussionTurns = item.discussionTurns.slice(-80);
    return true;
};

const appendInterviewerTurn = (item, decision) => {
    if (!decision?.shouldInterrupt || !decision?.interjection) return false;
    const text = trimTurn(decision.interjection, 600);
    if (!text) return false;
    const last = [...(item.discussionTurns || [])].reverse().find((turn) => turn?.speaker === "interviewer");
    if (trimTurn(last?.text, 600) === text) return false;
    item.discussionTurns.push({ speaker: "interviewer", text, kind: decision.kind || "challenge", at: new Date() });
    if (item.discussionTurns.length > 80) item.discussionTurns = item.discussionTurns.slice(-80);
    return true;
};

const publicAttempt = (attempt) => ({
    _id: attempt._id,
    candidateName: attempt.candidateName,
    status: attempt.status,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    rounds: attempt.rounds.map((round) => ({
        _id: round._id,
        name: round.name,
        description: round.description,
        deliveryMode: round.deliveryMode || "conversational",
        adaptive: Boolean(round.adaptiveState?.enabled),
        adaptiveComplete: Boolean(round.adaptiveComplete),
        maxQuestions: Number(round.adaptiveState?.maxQuestions) || round.questions.length,
        questionsAsked: Number(round.adaptiveState?.questionsAsked) || round.questions.filter((question) => question.answer).length,
        questions: round.questions.map((question) => {
            const history = followUpList(question);
            const pending = pendingFollowUpFor(question);
            return {
                _id: question._id,
                text: question.text,
                answer: question.answer,
                spokenExplanation: question.spokenExplanation,
                diagramData: question.diagramData,
                diagramSummary: question.diagramSummary,
                discussionTurns: (question.discussionTurns || []).map((turn) => ({ speaker: turn.speaker, text: turn.text, kind: turn.kind || "", at: turn.at })),
                followUps: history.map((followUp) => ({ question: followUp.question, answer: followUp.answer || "" })),
                ...currentFollowUpFields(question),
                followUpNumber: pending ? history.length : 0,
                remainingFollowUps: Math.max(0, 3 - history.length),
            };
        }),
    })),
});

const validateDiagram = (diagramData) => {
    if (diagramData == null || diagramData === "") return { valid: true, data: "", summary: "" };
    if (!isValidSystemDesignDiagram(diagramData)) return { valid: false, data: "", summary: "" };
    return {
        valid: true,
        data: diagramData.slice(0, 500000),
        summary: summarizeSystemDesignDiagram(diagramData),
    };
};

export const checkpointPracticeSystemDesign = async (req, res, next) => {
    try {
        const { roundId } = req.params;
        const interview = await findOwnedInterviewForRound(req.user._id, roundId);
        if (!interview) return res.status(404).json({ message: "Round not found" });
        const round = await Round.findById(roundId).populate("questions.question");
        if (!round || !isSystemDesignRound(round)) return res.status(400).json({ message: "Round is not a system-design discussion" });

        const index = Math.min(Math.max(Number(round.conversationalIndex) || 0, 0), Math.max(0, round.questions.length - 1));
        const item = round.questions[index] || round.questions[0];
        if (!item?.question?.text) return res.status(409).json({ message: "System-design problem is not ready yet" });
        const diagram = validateDiagram(req.body.diagramData || "");
        if (!diagram.valid) return res.status(400).json({ message: "Invalid or overly complex system-design diagram" });
        const transcript = (req.body.transcript || "").toString().trim().slice(0, 20000);

        if (transcript) item.answerGiven = transcript;
        appendCandidateDelta(item, transcript);
        if (diagram.data) {
            item.diagramData = diagram.data;
            item.diagramSummary = diagram.summary;
        }

        const decision = await generateSystemDesignInterjection({
            problem: item.question.text,
            transcript,
            diagramSummary: diagram.summary || item.diagramSummary || "",
            jobRole: interview.jobRole || "",
            roundName: round.name,
            previousInterjections: req.body.previousInterjections || [],
            forceInteraction: req.body.forceInteraction === true,
            candidateAskedQuestion: req.body.candidateAskedQuestion === true,
        });
        appendInterviewerTurn(item, decision);
        if (transcript || diagram.data || decision?.shouldInterrupt) await round.save();
        return res.json(decision);
    } catch (error) {
        return next(error instanceof Error ? error : new Error(String(error)));
    }
};

export const savePracticeSystemDesign = async (req, res, next) => {
    try {
        const { roundId } = req.params;
        const owned = await findOwnedInterviewForRound(req.user._id, roundId);
        if (!owned) return res.status(404).json({ message: "Round not found" });
        const round = await Round.findById(roundId).populate("questions.question");
        if (!round || !isSystemDesignRound(round)) return res.status(400).json({ message: "Round is not a system-design discussion" });
        const index = Math.min(Math.max(Number(round.conversationalIndex) || 0, 0), Math.max(0, round.questions.length - 1));
        const item = round.questions[index] || round.questions[0];
        if (!item) return res.status(409).json({ message: "System-design problem is not ready yet" });
        const transcript = (req.body.transcript || "").toString().trim().slice(0, 20000);
        if (!transcript) return res.status(400).json({ message: "Discuss your design before ending the round" });
        const diagram = validateDiagram(req.body.diagramData || "");
        if (!diagram.valid) return res.status(400).json({ message: "Invalid or overly complex system-design diagram" });

        item.answerGiven = transcript;
        appendCandidateDelta(item, transcript);
        item.diagramData = diagram.data;
        item.diagramSummary = diagram.summary;
        item.followUps = [];
        await round.save();
        return res.json({ success: true, diagramSummary: item.diagramSummary || "", discussionTurns: item.discussionTurns || [] });
    } catch (error) {
        return next(error instanceof Error ? error : new Error(String(error)));
    }
};

const candidateContext = async (req) => {
    const assessment = await findPublicAssessment(req.params.shareToken);
    if (!assessment) return { error: { status: 404, message: "Assessment unavailable" } };
    const attempt = await findAttempt(assessment._id, req.params.attemptId, req.get("x-attempt-token"));
    if (!attempt || attempt.status !== "started") return { error: { status: 401, message: "Attempt unavailable" } };
    const roundIndex = Number(req.body.roundIndex);
    const questionIndex = Number(req.body.questionIndex);
    const round = attempt.rounds?.[roundIndex];
    const item = round?.questions?.[questionIndex];
    if (!round || !item || !isSystemDesignRound(round)) return { error: { status: 400, message: "Invalid system-design question" } };
    return { assessment, attempt, round, item, roundIndex, questionIndex };
};

export const checkpointCandidateSystemDesign = async (req, res, next) => {
    try {
        const context = await candidateContext(req);
        if (context.error) return res.status(context.error.status).json({ message: context.error.message });
        const { assessment, attempt, round, item } = context;
        const diagram = validateDiagram(req.body.diagramData || "");
        if (!diagram.valid) return res.status(400).json({ message: "Invalid or overly complex system-design diagram" });
        const transcript = (req.body.transcript || "").toString().trim().slice(0, 20000);

        if (transcript) item.answer = transcript;
        appendCandidateDelta(item, transcript);
        if (diagram.data) {
            item.diagramData = diagram.data;
            item.diagramSummary = diagram.summary;
        }
        item.followUps = [];

        const decision = await generateSystemDesignInterjection({
            problem: item.text,
            transcript,
            diagramSummary: diagram.summary || item.diagramSummary || "",
            jobRole: assessment.jobRole || "",
            roundName: round.name,
            previousInterjections: req.body.previousInterjections || [],
            forceInteraction: req.body.forceInteraction === true,
            candidateAskedQuestion: req.body.candidateAskedQuestion === true,
        });
        appendInterviewerTurn(item, decision);
        if (transcript || diagram.data || decision?.shouldInterrupt) await attempt.save();
        return res.json(decision);
    } catch (error) {
        return next(error instanceof Error ? error : new Error(String(error)));
    }
};

export const saveCandidateSystemDesign = async (req, res, next) => {
    try {
        const context = await candidateContext(req);
        if (context.error) return res.status(context.error.status).json({ message: context.error.message });
        const { attempt, item } = context;
        const transcript = (req.body.transcript || "").toString().trim().slice(0, 20000);
        if (!transcript) return res.status(400).json({ message: "Discuss your design before continuing" });
        const diagram = validateDiagram(req.body.diagramData || "");
        if (!diagram.valid) return res.status(400).json({ message: "Invalid or overly complex system-design diagram" });

        item.answer = transcript;
        appendCandidateDelta(item, transcript);
        item.spokenExplanation = "";
        item.diagramData = diagram.data;
        item.diagramSummary = diagram.summary;
        item.followUps = [];
        await attempt.save();
        return res.json({ attempt: publicAttempt(attempt) });
    } catch (error) {
        return next(error instanceof Error ? error : new Error(String(error)));
    }
};
