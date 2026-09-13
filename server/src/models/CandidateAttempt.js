import mongoose from "mongoose";

const attemptFollowUpSchema = new mongoose.Schema({
    question: { type: String, required: true, maxlength: 1000 },
    answer: { type: String, maxlength: 5000, default: "" },
    reason: { type: String, maxlength: 240, default: "" },
    focus: { type: String, maxlength: 120, default: "" },
    answeredAt: Date,
}, { _id: false });

const discussionTurnSchema = new mongoose.Schema({
    speaker: { type: String, enum: ["candidate", "interviewer"], required: true },
    text: { type: String, maxlength: 20000, required: true },
    kind: { type: String, maxlength: 40, default: "" },
    at: { type: Date, default: Date.now },
}, { _id: false });

const debugFindingsSchema = new mongoose.Schema({
    rootCause: { type: String, maxlength: 10000, default: "" },
    evidence: { type: String, maxlength: 10000, default: "" },
    proposedFix: { type: String, maxlength: 10000, default: "" },
    impact: { type: String, maxlength: 10000, default: "" },
    testingStrategy: { type: String, maxlength: 10000, default: "" },
}, { _id: false });

const attemptQuestionSchema = new mongoose.Schema({
    text: { type: String, required: true, maxlength: 1000 },
    weight: { type: Number, min: 0.1, max: 10, default: 1 },
    competencies: [{ type: String, maxlength: 80 }],
    knockout: { type: Boolean, default: false },
    required: { type: Boolean, default: false },
    difficulty: { type: Number, min: 1, max: 5, default: 3 },
    sourceType: { type: String, enum: ["planned", "opening", "adaptive", "resume-claim", "fallback"], default: "planned" },
    sourceClaim: { type: String, maxlength: 500, default: "" },
    adaptiveEvaluated: { type: Boolean, default: false },
    quickEvaluation: { type: mongoose.Schema.Types.Mixed, default: undefined },
    answer: { type: String, maxlength: 20000, default: "" },
    spokenExplanation: { type: String, maxlength: 5000, default: "" },
    diagramData: { type: String, maxlength: 500000, default: "" },
    diagramSummary: { type: String, maxlength: 10000, default: "" },
    discussionTurns: { type: [discussionTurnSchema], default: [], validate: (value) => value.length <= 80 },
    followUps: { type: [attemptFollowUpSchema], default: [], validate: (value) => value.length <= 3 },
    followUpQuestion: { type: String, maxlength: 1000, default: "" },
    followUpAnswer: { type: String, maxlength: 5000, default: "" },
    feedbackComment: { type: String, maxlength: 2500, default: "" },
    suggestions: [{ type: String, maxlength: 300 }],
    score: { type: Number, min: 0, max: 10 },
}, { _id: true });

const attemptRoundSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: String,
    deliveryMode: { type: String, enum: ["conversational", "online-assessment", "system-design", "debugging"], default: "conversational" },
    adaptiveState: { type: mongoose.Schema.Types.Mixed, default: undefined },
    adaptiveComplete: { type: Boolean, default: false },
    questions: [attemptQuestionSchema],
    score: { type: Number, min: 0, max: 10 },
}, { _id: true });

const debuggingOverlayFileSchema = new mongoose.Schema({
    path: { type: String, required: true, maxlength: 500 },
    content: { type: String, default: "", maxlength: 262144 },
}, { _id: false });

const debuggingVisibleFailureSchema = new mongoose.Schema({
    name: { type: String, maxlength: 200, default: "" },
    message: { type: String, maxlength: 5000, default: "" },
}, { _id: false });

const debuggingRunSummarySchema = new mongoose.Schema({
    status: { type: String, enum: ["passed", "failed", "compile_error", "runtime_error", "timeout"], default: "failed" },
    visiblePassed: { type: Number, min: 0, default: 0 },
    visibleTotal: { type: Number, min: 0, default: 0 },
    hiddenPassed: { type: Number, min: 0, default: 0 },
    hiddenTotal: { type: Number, min: 0, default: 0 },
    visibleFailures: { type: [debuggingVisibleFailureSchema], default: [] },
    ranAt: { type: Date, default: Date.now },
}, { _id: false });

const debuggingResponseSchema = new mongoose.Schema({
    roundIndex: { type: Number, min: 0, required: true },
    responseMode: { type: String, enum: ["code_fix", "findings"], required: true },
    baseProjectFingerprint: { type: String, maxlength: 128, default: "" },
    changedFiles: { type: [debuggingOverlayFileSchema], default: [] },
    createdFiles: { type: [debuggingOverlayFileSchema], default: [] },
    deletedFiles: [{ type: String, maxlength: 500 }],
    findings: { type: debugFindingsSchema, default: undefined },
    visibleTestRuns: { type: [debuggingRunSummarySchema], default: [], validate: (value) => value.length <= 20 },
    finalEvaluation: { type: mongoose.Schema.Types.Mixed, default: undefined },
    submittedAt: Date,
}, { _id: false });

const evaluationMetadataSchema = new mongoose.Schema({
    engineVersion: { type: String, maxlength: 80, default: "" },
    promptVersion: { type: String, maxlength: 80, default: "" },
    questionCount: { type: Number, min: 0, default: 0 },
    completedAt: Date,
}, { _id: false });

const candidateAttemptSchema = new mongoose.Schema({
    assessment: { type: mongoose.Schema.Types.ObjectId, ref: "Assessment", required: true, index: true },
    candidateName: { type: String, required: true, maxlength: 120 },
    candidateEmail: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    accessTokenHash: { type: String, required: true, select: false },
    status: { type: String, enum: ["started", "evaluating", "submitted", "evaluation_failed"], default: "started", index: true },
    startedAt: { type: Date, default: Date.now },
    privacyConsentAt: { type: Date, required: true },
    submittedAt: Date,
    evaluationStartedAt: Date,
    evaluationError: { type: String, maxlength: 500, default: "" },
    evaluationMetadata: { type: evaluationMetadataSchema, default: undefined },
    rounds: [attemptRoundSchema],
    debuggingResponses: { type: [debuggingResponseSchema], default: [] },
    overallScore: { type: Number, min: 0, max: 10 },
    reviewerScore: { type: Number, min: 0, max: 10 },
    reviewerDecision: { type: String, enum: ["", "advance", "hold", "reject"], default: "" },
    reviewerNotes: { type: String, maxlength: 5000, default: "" },
    reviewerRatings: [{ criterion: { type: String, maxlength: 80 }, score: { type: Number, min: 0, max: 10 }, note: { type: String, maxlength: 1000, default: "" } }],
    reviewedAt: Date,
    integrityConsentAt: Date,
    integrityEvents: [{ type: { type: String, enum: ["tab_hidden", "window_blur", "fullscreen_exit", "copy", "paste", "offline", "online", "face_missing", "face_restored", "multiple_faces", "camera_interrupted", "face_detection_unavailable"] }, at: { type: Date, default: Date.now }, metadata: { type: mongoose.Schema.Types.Mixed } }],
}, { timestamps: true });

candidateAttemptSchema.pre("save", function normalizeSingleTaskRounds() {
    for (const round of this.rounds || []) {
        if (!["system-design", "debugging"].includes(round.deliveryMode)) continue;
        if (Array.isArray(round.questions) && round.questions.length > 1) {
            round.questions = [round.questions[0]];
        }
    }
});

candidateAttemptSchema.index({ assessment: 1, candidateEmail: 1 }, { unique: true });
candidateAttemptSchema.index({ assessment: 1, createdAt: -1 });

export default mongoose.model("CandidateAttempt", candidateAttemptSchema);
