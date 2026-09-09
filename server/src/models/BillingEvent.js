import mongoose from "mongoose";

const billingEventSchema = new mongoose.Schema({
    provider: { type: String, enum: ["stripe"], required: true },
    eventId: { type: String, required: true },
    type: { type: String, required: true },
    status: { type: String, enum: ["processing", "processed", "failed"], default: "processing", index: true },
    leaseExpiresAt: { type: Date, default: null },
    processedAt: { type: Date, default: null },
    lastError: { type: String, maxlength: 1000, default: "" },
}, { timestamps: true });
billingEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

export default mongoose.model("BillingEvent", billingEventSchema);
