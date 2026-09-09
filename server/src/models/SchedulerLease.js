import mongoose from "mongoose";

const schedulerLeaseSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true, trim: true, maxlength: 120 },
    owner: { type: String, required: true, trim: true, maxlength: 200 },
    expiresAt: { type: Date, required: true, index: true },
}, { timestamps: true });

export default mongoose.model("SchedulerLease", schedulerLeaseSchema);
