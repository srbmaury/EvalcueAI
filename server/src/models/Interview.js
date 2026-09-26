import mongoose from "mongoose";

const interviewSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        resume: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Resume",
            default: null,
        },
        company: {
            type: String,
            required: true,
        },
        jobRole: {
            type: String,
            required: true,
        },
        jobDescription: {
            type: String,
            required: true,
        },
        grounding: {
            status: { type: String, enum: ["grounded", "simulation"], default: "simulation" },
            retrievedAt: Date,
            sources: [{ title: { type: String, maxlength: 180 }, url: { type: String, maxlength: 2000 }, snippet: { type: String, maxlength: 700 } }],
            reportedQuestions: [{ type: String, maxlength: 220 }],
        },
        rounds: {
            type: [
                {
                    round: {
                        type: mongoose.Schema.Types.ObjectId,
                        ref: "Round",
                        required: true,
                    },
                },
            ],
            required: true,
        },
        overallScore: { type: Number, default: 0 },
        // Optional, unscored self-introduction given before the first conversational round. Used only as
        // background so follow-ups build on what the candidate actually said. candidateIntroAt is set on
        // answer or skip so the prompt is shown once.
        candidateIntro: { type: String, maxlength: 3000, default: "" },
        candidateIntroAt: { type: Date },
    },
    { timestamps: true }
);

interviewSchema.index({ user: 1, createdAt: -1 });

const Interview = mongoose.model("Interview", interviewSchema);
export default Interview;
