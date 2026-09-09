import mongoose from "mongoose";

const ssoDomainClaimSchema = new mongoose.Schema({
    domain: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 253 },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
}, { timestamps: true });

export default mongoose.model("SsoDomainClaim", ssoDomainClaimSchema);
