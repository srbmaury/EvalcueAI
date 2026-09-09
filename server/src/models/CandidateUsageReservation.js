import mongoose from "mongoose";

const candidateUsageReservationSchema = new mongoose.Schema({
    attempt: { type: mongoose.Schema.Types.ObjectId, ref: "CandidateAttempt", required: true, unique: true, index: true },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    counter: { type: mongoose.Schema.Types.ObjectId, ref: "OrganizationUsageCounter", required: true, index: true },
    status: { type: String, enum: ["reserved", "finalized", "released"], default: "reserved", index: true },
    expiresAt: { type: Date, required: true, index: true },
    finalizedAt: { type: Date, default: null },
    releasedAt: { type: Date, default: null },
}, { timestamps: true });

export default mongoose.model("CandidateUsageReservation", candidateUsageReservationSchema);
