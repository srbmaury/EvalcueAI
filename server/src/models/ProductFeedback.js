import mongoose from "mongoose";

const productFeedbackSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    category: { type: String, enum: ["idea", "problem", "praise", "other"], required: true },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    page: { type: String, trim: true, maxlength: 300, default: "" },
    photos: {
        type: [{ url: { type: String, required: true }, publicId: { type: String, required: true } }],
        default: [],
        validate: { validator: (value) => value.length <= 4, message: "Up to 4 photos are allowed." },
    },
    status: { type: String, enum: ["new", "reviewed", "closed"], default: "new", index: true },
}, { timestamps: true });

export default mongoose.model("ProductFeedback", productFeedbackSchema);
