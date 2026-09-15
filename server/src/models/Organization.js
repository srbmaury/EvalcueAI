import mongoose from "mongoose";

const subscriptionStatuses = [
    "inactive",
    "incomplete",
    "incomplete_expired",
    "trialing",
    "active",
    "past_due",
    "canceled",
    "unpaid",
    "paused",
];

const ssoSchema = new mongoose.Schema(
    {
        enabled: { type: Boolean, default: false },
        issuer: { type: String, trim: true, default: "", maxlength: 500 },
        clientId: { type: String, trim: true, default: "", maxlength: 500 },
        clientSecretEncrypted: { type: String, default: "", select: false },
        domains: [{ type: String, trim: true, lowercase: true, maxlength: 253 }],
        tokenAuthMethod: { type: String, enum: ["client_secret_post", "client_secret_basic"], default: "client_secret_post" },
        jitProvisioning: { type: Boolean, default: false },
        defaultRole: { type: String, enum: ["recruiter", "hiring_manager", "reviewer"], default: "reviewer" },
        configuredAt: { type: Date, default: null },
    },
    { _id: false }
);

const hiringGrantSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: ["none", "design_partner", "paid_pilot"],
            default: "none",
        },
        candidateInterviews: { type: Number, min: 0, default: 0 },
        startsAt: { type: Date, default: null },
        expiresAt: { type: Date, default: null },
        grantId: { type: String, trim: true, default: "", maxlength: 200 },
        grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        source: { type: String, enum: ["admin", "stripe", "none"], default: "none" },
        note: { type: String, trim: true, default: "", maxlength: 500 },
        stripeCheckoutSessionId: { type: String, trim: true, default: "", maxlength: 200 },
    },
    { _id: false }
);

const organizationSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 120,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            immutable: true,
            index: true,
        },
        hiringPlan: {
            type: String,
            enum: ["none", "trial", "starter", "growth", "enterprise"],
            default: "none",
            index: true,
        },
        hiringSubscriptionStatus: {
            type: String,
            enum: subscriptionStatuses,
            default: "inactive",
        },
        hiringTrialEligible: {
            type: Boolean,
            default: false,
        },
        hiringGrant: { type: hiringGrantSchema, default: () => ({}) },
        hiringBillingProvider: {
            type: String,
            enum: ["none", "stripe"],
            default: "none",
            select: false,
        },
        hiringBillingCustomerId: {
            type: String,
            default: "",
            select: false,
        },
        hiringBillingSubscriptionId: {
            type: String,
            default: "",
            select: false,
        },
        hiringCurrentPeriodEnd: {
            type: Date,
            default: null,
        },
        // When a subscription sync last applied, by the Stripe event's own creation time
        // (not our processing time) — guards against an out-of-order/retried webhook
        // overwriting a newer subscription state with a stale one.
        hiringBillingSyncedEventAt: {
            type: Date,
            default: null,
            select: false,
        },
        sso: { type: ssoSchema, default: () => ({}) },
    },
    { timestamps: true }
);

organizationSchema.index({ createdBy: 1, createdAt: -1 });
organizationSchema.index({ hiringBillingCustomerId: 1 }, { sparse: true });
organizationSchema.index({ "hiringGrant.grantId": 1 }, { sparse: true });
organizationSchema.index({ "hiringGrant.stripeCheckoutSessionId": 1 }, { sparse: true });
organizationSchema.index({ "sso.domains": 1, "sso.enabled": 1 });

export default mongoose.model("Organization", organizationSchema);
