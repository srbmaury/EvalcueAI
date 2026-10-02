import mongoose from "mongoose";

const AuditLogSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        action: { type: String, required: true },
        entityType: { type: String },
        entityId: { type: String },
        ip: { type: String },
        userAgent: { type: String },
        requestId: { type: String },
        method: { type: String },
        path: { type: String },
        statusCode: { type: Number },
        outcome: { type: String, enum: ["success", "failure"], required: true },
        durationMs: { type: Number },
        metadata: { type: Object },
    },
    { timestamps: true }
);

AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: Number(process.env.AUDIT_TTL_SECONDS || 60 * 60 * 24 * 90) });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ user: 1, createdAt: -1 });
AuditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

const AuditLog = mongoose.model("AuditLog", AuditLogSchema);

export default AuditLog;
