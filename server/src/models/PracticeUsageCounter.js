import mongoose from "mongoose";

const practiceUsageCounterSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    metric: { type: String, enum: ["interviews", "resumeReviews", "resumeGenerations"], required: true },
    period: { type: String, required: true },
    used: { type: Number, min: 0, default: 0 },
}, { timestamps: true });

practiceUsageCounterSchema.index({ user: 1, metric: 1, period: 1 }, { unique: true });

export default mongoose.model("PracticeUsageCounter", practiceUsageCounterSchema);
