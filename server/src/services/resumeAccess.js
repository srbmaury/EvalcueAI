import cloudinary from "../config/cloudinaryConfig.js";

export const resumeFileUrl = (_req, resume) => {
    const resumeId = String(resume?._id || "");
    return resumeId ? `/api/resumes/${encodeURIComponent(resumeId)}/file` : "";
};

export const publicResume = (req, resume) => {
    if (!resume) return resume;
    const raw = typeof resume.toObject === "function" ? resume.toObject() : { ...resume };
    raw.fileUrl = resumeFileUrl(req, raw);
    delete raw.publicId;
    delete raw.deliveryType;
    delete raw.extractedText;
    return raw;
};

export const resumeStorageUrl = (resume) => {
    if (resume?.deliveryType === "authenticated" && resume?.publicId) {
        return cloudinary.url(resume.publicId, {
            resource_type: "raw",
            type: "authenticated",
            sign_url: true,
            secure: true,
        });
    }
    return resume?.fileUrl || "";
};
