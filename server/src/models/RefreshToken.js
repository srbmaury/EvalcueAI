import mongoose from "mongoose";

const refreshTokenSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    userAgent: { type: String },
    ip: { type: String },
    replacedByTokenHash: { type: String, default: "", select: false },
    rotationGraceUntil: { type: Date, default: null, select: false },
    // The successor token, encrypted, kept only for the grace window so a client whose refresh response was
    // lost (navigated away, tab closed, network drop) can be handed the same successor instead of signed out.
    graceSuccessor: { type: String, default: "", select: false },
    graceSuccessorExpiresAt: { type: Date, default: null, select: false },
    rotatedAt: { type: Date, default: null },
});

const RefreshToken = mongoose.model("RefreshToken", refreshTokenSchema);
export default RefreshToken;
