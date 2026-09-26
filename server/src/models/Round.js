import mongoose from "mongoose";
import AdaptiveInterviewTrace from "./AdaptiveInterviewTrace.js";
import metrics from "../metrics/index.js";

const followUpSchema = new mongoose.Schema({
    question: { type: String, required: true, maxlength: 1000 },
    answer: { type: String, maxlength: 5000, default: "" },
    reason: { type: String, maxlength: 240, default: "" },
    focus: { type: String, maxlength: 120, default: "" },
    skipped: { type: Boolean, default: false },
    askedAt: { type: Date, default: Date.now },
    answeredAt: { type: Date },
}, { _id: false });

const discussionTurnSchema = new mongoose.Schema({
    speaker: { type: String, enum: ["candidate", "interviewer"], required: true },
    text: { type: String, maxlength: 20000, required: true },
    kind: { type: String, maxlength: 40, default: "" },
    at: { type: Date, default: Date.now },
}, { _id: false });

const evidenceSchema = new mongoose.Schema({
    text: { type: String, maxlength: 500, default: "" },
    score: { type: Number, min: 0, max: 10 },
    confidence: { type: Number, min: 0, max: 1 },
    questionIndex: { type: Number, min: 0 },
    createdAt: { type: Date, default: Date.now },
}, { _id: false });

const competencySchema = new mongoose.Schema({
    name: { type: String, required: true, maxlength: 80 },
    description: { type: String, maxlength: 240, default: "" },
    weight: { type: Number, min: 0.1, max: 3, default: 1 },
    scoreEstimate: { type: Number, min: 0, max: 10, default: null },
    confidence: { type: Number, min: 0, max: 1, default: 0 },
    evidenceCount: { type: Number, min: 0, default: 0 },
    coverage: {
        type: String,
        enum: ["uncovered", "partial", "covered"],
        default: "uncovered",
    },
    evidence: { type: [evidenceSchema], default: [] },
    updatedAt: { type: Date },
}, { _id: false });

const resumeClaimSchema = new mongoose.Schema({
    claim: { type: String, required: true, maxlength: 500 },
    topics: [{ type: String, maxlength: 80 }],
    probeAreas: [{ type: String, maxlength: 120 }],
    probeCount: { type: Number, min: 0, default: 0 },
    covered: { type: Boolean, default: false },
}, { _id: false });

const policyDecisionSchema = new mongoose.Schema({
    action: {
        type: String,
        enum: ["next-question", "end-round", "continue"],
        default: "continue",
    },
    targetCompetency: { type: String, maxlength: 80, default: "" },
    sourceClaim: { type: String, maxlength: 500, default: "" },
    reason: { type: String, maxlength: 500, default: "" },
    confidence: { type: Number, min: 0, max: 1, default: 0 },
    difficulty: { type: Number, min: 1, max: 5, default: 3 },
    decidedAt: { type: Date, default: Date.now },
}, { _id: false });

const adaptiveStateSchema = new mongoose.Schema({
    enabled: { type: Boolean, default: false },
    engineVersion: { type: String, maxlength: 80, default: "adaptive-v1" },
    promptVersion: { type: String, maxlength: 80, default: "adaptive-2026-09-v1" },
    minQuestions: { type: Number, min: 1, max: 20, default: 2 },
    maxQuestions: { type: Number, min: 1, max: 20, default: 5 },
    currentDifficulty: { type: Number, min: 1, max: 5, default: 3 },
    questionsAsked: { type: Number, min: 0, default: 0 },
    competencies: { type: [competencySchema], default: [] },
    resumeClaims: { type: [resumeClaimSchema], default: [] },
    lastDecision: { type: policyDecisionSchema, default: () => ({}) },
    completedReason: { type: String, maxlength: 500, default: "" },
    initializedAt: { type: Date },
    updatedAt: { type: Date },
}, { _id: false });

const evaluationDimensionSchema = new mongoose.Schema({
    name: { type: String, maxlength: 80 },
    score: { type: Number, min: 0, max: 10 },
    evidence: [{ type: String, maxlength: 300 }],
}, { _id: false });

const competencyEvidenceSchema = new mongoose.Schema({
    name: { type: String, maxlength: 80 },
    score: { type: Number, min: 0, max: 10 },
    confidence: { type: Number, min: 0, max: 1 },
    evidence: [{ type: String, maxlength: 300 }],
}, { _id: false });

const quickEvaluationSchema = new mongoose.Schema({
    overallScore: { type: Number, min: 0, max: 10 },
    unscored: { type: Boolean, default: false },
    confidence: { type: Number, min: 0, max: 1, default: 0 },
    dimensions: { type: [evaluationDimensionSchema], default: [] },
    competencyEvidence: { type: [competencyEvidenceSchema], default: [] },
    strengths: [{ type: String, maxlength: 300 }],
    gaps: [{ type: String, maxlength: 300 }],
    evaluatedAt: { type: Date },
}, { _id: false });

const roundSchema = new mongoose.Schema({
    name: { type: String, required: true },
    nextRound: { type: mongoose.Schema.Types.ObjectId, ref: "Round" },
    description: { type: String, required: true },
    deliveryMode: {
        type: String,
        enum: ["online-assessment", "conversational"],
        default: "conversational",
    },
    skills: [{ type: String, maxlength: 80 }],
    rationale: { type: String, maxlength: 300, default: "" },
    recommended: { type: Boolean, default: true },
    conversationalIndex: { type: Number, default: 0 },
    status: {
        type: String,
        enum: ["pending", "in_progress", "completed"],
        default: "pending",
    },
    questionLimit: { type: Number, default: 8 },
    adaptiveState: { type: adaptiveStateSchema, default: () => ({}) },
    questions: [{
        question: { type: mongoose.Schema.Types.ObjectId, ref: "Question" },
        answerGiven: { type: String },
        diagramData: { type: String, maxlength: 500000, default: "" },
        diagramSummary: { type: String, maxlength: 10000, default: "" },
        discussionTurns: { type: [discussionTurnSchema], default: [], validate: (value) => value.length <= 80 },
        followUps: { type: [followUpSchema], default: [] },
        difficulty: { type: Number, min: 1, max: 5, default: 3 },
        competencies: [{ type: String, maxlength: 80 }],
        sourceType: {
            type: String,
            enum: ["planned", "adaptive", "resume-claim", "fallback"],
            default: "planned",
        },
        sourceClaim: { type: String, maxlength: 500, default: "" },
        quickEvaluation: { type: quickEvaluationSchema, default: undefined },
        feedback: { type: mongoose.Schema.Types.ObjectId, ref: "Feedback" },
    }],
});

const coverageOf = (state) => {
    const competencies = Array.isArray(state?.competencies) ? state.competencies : [];
    if (!competencies.length) return 0;
    let weighted = 0;
    let total = 0;
    for (const item of competencies) {
        const weight = Math.max(0.1, Number(item?.weight) || 1);
        const confidence = Math.max(0, Math.min(1, Number(item?.confidence) || 0));
        weighted += weight * Math.min(1, confidence / 0.72);
        total += weight;
    }
    return total ? weighted / total : 0;
};

const averageConfidenceOf = (state) => {
    const competencies = Array.isArray(state?.competencies) ? state.competencies : [];
    if (!competencies.length) return 0;
    return competencies.reduce((sum, item) => sum + Math.max(0, Math.min(1, Number(item?.confidence) || 0)), 0) / competencies.length;
};

const followUpCountOf = (questions) => (questions || []).reduce((sum, item) => sum + (Array.isArray(item?.followUps) ? item.followUps.length : 0), 0);
const comparableDecision = (state) => JSON.stringify({
    action: state?.lastDecision?.action || "",
    targetCompetency: state?.lastDecision?.targetCompetency || "",
    difficulty: Number(state?.lastDecision?.difficulty) || 0,
    reason: state?.lastDecision?.reason || "",
});

roundSchema.pre("save", async function captureAdaptivePrevious() {
    if (!this.adaptiveState?.enabled) return;
    if (!this.isNew && !this.isModified("adaptiveState") && !this.isModified("questions") && !this.isModified("status")) return;
    if (this.isNew) {
        this.$locals.adaptivePrevious = null;
        return;
    }
    this.$locals.adaptivePrevious = await this.constructor.findById(this._id)
        .select("adaptiveState status questions.sourceType questions.sourceClaim questions.followUps")
        .lean();
});

roundSchema.post("save", async function recordAdaptiveTrace(doc) {
    if (!doc.adaptiveState?.enabled) return;
    const previous = this.$locals?.adaptivePrevious || null;
    const beforeState = previous?.adaptiveState || {};
    const afterState = doc.adaptiveState || {};
    const beforeQuestions = previous?.questions || [];
    const afterQuestions = doc.questions || [];
    const beforeFollowUps = followUpCountOf(beforeQuestions);
    const afterFollowUps = followUpCountOf(afterQuestions);
    const beforeAsked = Number(beforeState?.questionsAsked) || 0;
    const afterAsked = Number(afterState?.questionsAsked) || 0;
    const beforeDifficulty = Number(beforeState?.currentDifficulty) || Number(afterState?.currentDifficulty) || 3;
    const afterDifficulty = Number(afterState?.currentDifficulty) || beforeDifficulty;
    const statusChanged = previous?.status !== doc.status;
    const meaningful = !previous
        || beforeQuestions.length !== afterQuestions.length
        || beforeFollowUps !== afterFollowUps
        || beforeAsked !== afterAsked
        || beforeDifficulty !== afterDifficulty
        || statusChanged
        || comparableDecision(beforeState) !== comparableDecision(afterState);
    if (!meaningful) return;

    let eventType = "policy_updated";
    if (!previous || !beforeState?.enabled) eventType = "initialized";
    else if (doc.status === "completed" && previous.status !== "completed") eventType = "completed";
    else if (afterQuestions.length > beforeQuestions.length) eventType = "question_selected";
    else if (afterAsked > beforeAsked) eventType = "evidence_evaluated";
    else if (afterFollowUps > beforeFollowUps) eventType = "follow_up";

    const lastQuestion = afterQuestions[afterQuestions.length - 1] || {};
    const action = afterState?.lastDecision?.action || "";
    const coverageBefore = coverageOf(beforeState);
    const coverageAfter = coverageOf(afterState);
    const trace = {
        round: doc._id,
        eventType,
        action,
        targetCompetency: afterState?.lastDecision?.targetCompetency || "",
        sourceType: lastQuestion?.sourceType || "",
        usedResumeClaim: Boolean(lastQuestion?.sourceClaim) || lastQuestion?.sourceType === "resume-claim",
        fallbackUsed: lastQuestion?.sourceType === "fallback",
        questionCount: afterQuestions.length,
        questionsAsked: afterAsked,
        followUpCount: afterFollowUps,
        difficultyFrom: beforeDifficulty,
        difficultyTo: afterDifficulty,
        coverageBefore,
        coverageAfter,
        averageConfidenceBefore: averageConfidenceOf(beforeState),
        averageConfidenceAfter: averageConfidenceOf(afterState),
        engineVersion: afterState?.engineVersion || "adaptive-v1",
        promptVersion: afterState?.promptVersion || "adaptive-2026-09-v1",
        reason: afterState?.lastDecision?.reason || afterState?.completedReason || "",
    };

    try {
        await AdaptiveInterviewTrace.create(trace);
        metrics.adaptiveInterviewEventsTotal.labels(eventType, action || "none").inc();
        if (beforeDifficulty !== afterDifficulty) metrics.adaptiveDifficultyTransitionsTotal.labels(String(beforeDifficulty), String(afterDifficulty)).inc();
        if (trace.fallbackUsed && eventType === "question_selected") metrics.adaptiveFallbackQuestionsTotal.inc();
        if (afterFollowUps > beforeFollowUps) metrics.adaptiveFollowUpsTotal.inc(afterFollowUps - beforeFollowUps);
        if (eventType === "completed") {
            metrics.adaptiveRoundQuestions.observe(afterAsked || afterQuestions.length);
            metrics.adaptiveRoundCoverage.observe(Math.round(coverageAfter * 1000) / 10);
        }
    } catch (error) {
        console.warn("adaptive trace persistence failed", error?.message || error);
    }
});

const Round = mongoose.model("Round", roundSchema);
export default Round;
