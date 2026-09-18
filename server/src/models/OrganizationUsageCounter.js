import mongoose from "mongoose";

const organizationUsageCounterSchema = new mongoose.Schema({
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
    metric: { type: String, enum: ["candidateInterviews"], required: true },
    period: { type: String, required: true },
    used: { type: Number, min: 0, default: 0 },
    reserved: { type: Number, min: 0, default: 0 },
}, { timestamps: true });

organizationUsageCounterSchema.index({ organization: 1, metric: 1, period: 1 }, { unique: true });

export default mongoose.model("OrganizationUsageCounter", organizationUsageCounterSchema);
