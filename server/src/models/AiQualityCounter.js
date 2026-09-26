import mongoose from "mongoose";

// Daily totals of AI quality signals (guard interventions, unscored evaluations, fallbacks) together with
// their denominators, so admins can see rates without a metrics stack. Keys are bounded; no user data.
const aiQualityCounterSchema = new mongoose.Schema({
    day: { type: Date, required: true },
    stage: { type: String, required: true, maxlength: 40 },
    signal: { type: String, required: true, maxlength: 40 },
    outcome: { type: String, required: true, maxlength: 40 },
    count: { type: Number, default: 0, min: 0 },
}, { versionKey: false });

aiQualityCounterSchema.index({ day: 1, stage: 1, signal: 1, outcome: 1 }, { unique: true });
aiQualityCounterSchema.index({ day: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

export default mongoose.model("AiQualityCounter", aiQualityCounterSchema);
