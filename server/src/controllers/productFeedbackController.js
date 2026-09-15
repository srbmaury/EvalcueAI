import streamifier from "streamifier";
import cloudinary from "../config/cloudinaryConfig.js";
import ProductFeedback from "../models/ProductFeedback.js";
import { optionalAntivirusScan } from "../utils/avScan.js";

const uploadPhoto = (buffer) => new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
        { resource_type: "image", type: "upload", folder: "feedback_photos" },
        (error, result) => (error ? reject(error) : resolve(result)),
    );
    streamifier.createReadStream(buffer).pipe(stream);
});

export const createProductFeedback = async (req, res, next) => {
    const uploaded = [];
    try {
        const files = req.files || [];
        for (const file of files) {
            const av = await optionalAntivirusScan(file.buffer);
            if (!av.clean) return res.status(400).json({ message: "A photo failed security scanning." });
        }
        for (const file of files) {
            uploaded.push(await uploadPhoto(file.buffer));
        }
        const feedback = await ProductFeedback.create({
            ...req.body,
            user: req.user._id,
            photos: uploaded.map((result) => ({ url: result.secure_url, publicId: result.public_id })),
        });
        return res.status(201).json({ _id: feedback._id, message: "Feedback received" });
    } catch (error) {
        await Promise.all(uploaded.map((result) => cloudinary.uploader.destroy(result.public_id, { resource_type: "image" }).catch(() => {})));
        return next(error);
    }
};
