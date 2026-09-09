import mongoose from "mongoose";

const resumeSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: "User",
        },
        fileUrl: {
            type: String,
            required: true,
        },
        publicId: {
            type: String,
            required: true,
        },
        deliveryType: {
            type: String,
            enum: ["upload", "authenticated"],
            default: "upload",
        },
        fileName: {
            type: String,
            required: true,
        },
        fileType: {
            type: String,
            required: true,
        },
        fileSize: {
            type: Number,
            required: true,
            min: 1,
        },
        extractedText: {
            type: String,
            required: true,
        },
        tags: {
            type: [String],
            default: [],
        },
        notes: {
            type: String,
            default: "",
            maxlength: 2000,
        },
    },
    { timestamps: true }
);

resumeSchema.index({ user: 1, createdAt: -1 });

const Resume = mongoose.model("Resume", resumeSchema);
export default Resume;
