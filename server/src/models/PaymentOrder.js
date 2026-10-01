import mongoose from "mongoose";
const schema = new mongoose.Schema({
    txnid: { type: String, required: true, unique: true },
    tokenHash: { type: String, required: true, select: false },
    product: { type: String, enum: ["practice", "hiring"], required: true },
    plan: { type: String, enum: ["pro", "pilot", "starter", "growth"], required: true },
    billingOwner: { type: mongoose.Schema.Types.ObjectId, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null, index: true },
    amount: { type: Number, required: true, min: 100 },
    planId: { type: String, default: "" },
    validDays: { type: Number, default: 30 },
    candidateInterviews: { type: Number, default: 0 },
    status: { type: String, enum: ["pending", "failed", "paid"], default: "pending" },
    provisioning: { type: String, enum: ["none", "creating", "ready", "review_required"], default: "none" },
    subscriptionId: { type: String, default: "", index: true },
    providerPaymentId: { type: String, default: "" },
    checkoutFields: { type: mongoose.Schema.Types.Mixed, required: true, select: false },
    paidAt: { type: Date, default: null },
    paidUntil: { type: Date, default: null },
    mandateEnd: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
}, { timestamps: true });
// A checkout reservation prevents two tabs from creating two mandates for one billing owner.
schema.index({ product: 1, billingOwner: 1 }, { unique: true, partialFilterExpression: { status: "pending" } });
export default mongoose.model("PaymentOrder", schema);
