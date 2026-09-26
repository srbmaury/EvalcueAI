import mongoose from "mongoose";
import { RUNTIME_IDS } from "../config/codeRuntimes.js";

const assessmentQuestionSchema = new mongoose.Schema({
    text: { type: String, required: true, maxlength: 1000 },
    weight: { type: Number, min: 0.1, max: 10, default: 1 },
    competencies: [{ type: String, maxlength: 80 }],
    knockout: { type: Boolean, default: false },
    required: { type: Boolean, default: false },
}, { _id: true });

const debuggingProjectFileSchema = new mongoose.Schema({
    path: { type: String, required: true, maxlength: 500 },
    content: { type: String, default: "", maxlength: 262144 },
    kind: { type: String, enum: ["source", "hidden_test"], required: true },
    displayName: { type: String, maxlength: 120, default: "" },
}, { _id: false });

const debuggingRoundSchema = new mongoose.Schema({
    responseMode: { type: String, enum: ["code_fix", "findings"], required: true },
    runtime: { type: String, enum: RUNTIME_IDS, required: true },
    entryFile: { type: String, maxlength: 500, default: "" },
    files: {
        type: [debuggingProjectFileSchema],
        default: [],
        validate: {
            validator(value) { return Array.isArray(value) && value.length >= 1 && value.length <= 100; },
            message: "Debugging projects require 1 to 100 files",
        },
    },
}, { _id: false });

const assessmentRoundSchema = new mongoose.Schema({
    name: { type: String, required: true, maxlength: 80 },
    description: { type: String, maxlength: 300 },
    deliveryMode: { type: String, enum: ["conversational", "online-assessment", "system-design", "debugging"], default: "conversational" },
    adaptive: { type: Boolean, default: false },
    questionCount: {
        type: Number,
        min: 1,
        max: 10,
        default: 3,
        validate: {
            validator(value) {
                const requiredCount = (this.questions || []).filter((question) => question.required).length;
                return Number(value) >= requiredCount;
            },
            message: "Question budget must include every required recruiter question",
        },
    },
    questions: { type: [assessmentQuestionSchema], validate: (value) => value.length >= 1 && value.length <= 10 },
    debugging: {
        type: debuggingRoundSchema,
        default: undefined,
        validate: {
            validator(value) {
                if (this.deliveryMode !== "debugging") return true;
                if (!value || !Array.isArray(value.files) || value.files.length < 1) return false;
                const hasSource = value.files.some((file) => file.kind === "source");
                if (!hasSource) return false;
                if (value.responseMode === "code_fix") return value.files.some((file) => file.kind === "hidden_test");
                if (value.responseMode === "findings") return value.files.every((file) => file.kind === "source");
                return false;
            },
            message: "Debugging rounds require source files; code-fix rounds require hidden tests and findings rounds contain source files only",
        },
    },
}, { _id: true });

const assessmentSchema = new mongoose.Schema({
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, maxlength: 160 },
    jobRole: { type: String, required: true, maxlength: 120 },
    jobDescription: { type: String, required: true, maxlength: 4000 },
    shareToken: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: ["draft", "scheduled", "active", "closed", "archived"], default: "draft", index: true },
    publishedAt: Date,
    archivedAt: Date,
    opensAt: Date,
    timezone: { type: String, maxlength: 100, default: "UTC" },
    followUpsEnabled: { type: Boolean, default: true },
    // Ask for a short, unscored self-introduction before round 1; used only as background for AI questions.
    askCandidateIntro: { type: Boolean, default: true },
    inviteOnly: { type: Boolean, default: false },
    candidateInstructions: { type: String, maxlength: 1200, default: "" },
    contactEmail: { type: String, maxlength: 254, default: "" },
    durationMinutes: { type: Number, min: 5, max: 240, default: 30 },
    expiresAt: Date,
    integrity: {
        enabled: { type: Boolean, default: false },
        requireFullscreen: { type: Boolean, default: false },
        trackFocus: { type: Boolean, default: true },
        trackClipboard: { type: Boolean, default: true },
        requireCamera: { type: Boolean, default: false },
        monitorFacePresence: { type: Boolean, default: false },
        retentionDays: { type: Number, min: 1, max: 365, default: 30 },
    },
    rubric: [{ name: { type: String, maxlength: 80 }, description: { type: String, maxlength: 300 }, weight: { type: Number, min: 1, max: 100, default: 1 } }],
    templateName: { type: String, maxlength: 160, default: "" },
    templateVersion: { type: Number, min: 1, default: 1 },
    invitations: [{
        email: { type: String, lowercase: true, trim: true, maxlength: 254 },
        name: { type: String, maxlength: 120, default: "" },
        status: { type: String, enum: ["queued", "invited", "sent", "delivered", "failed", "bounced", "opened", "started", "completed", "revoked"], default: "queued" },
        invitedAt: { type: Date, default: Date.now }, lastSentAt: Date, nextAttemptAt: Date, openedAt: Date, revokedAt: Date,
        attempts: { type: Number, default: 0 }, providerMessageId: String, providerEventId: String, providerEventAt: Date,
        lastError: { type: String, maxlength: 500, default: "" },
    }],
    rounds: { type: [assessmentRoundSchema], validate: (value) => value.length >= 1 && value.length <= 5 },
}, { timestamps: true });

assessmentSchema.pre("validate", function normalizeSingleTaskRounds(next) {
    for (const round of this.rounds || []) {
        if (!["system-design", "debugging"].includes(round.deliveryMode)) continue;
        round.questionCount = 1;
        if (Array.isArray(round.questions) && round.questions.length > 1) round.questions = [round.questions[0]];
    }
    next();
});

assessmentSchema.index({ organization: 1, createdAt: -1 });
assessmentSchema.index({ organization: 1, status: 1, createdAt: -1 });

export default mongoose.model("Assessment", assessmentSchema);
