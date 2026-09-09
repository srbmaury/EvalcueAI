import crypto from "node:crypto";
import cloudinary from "../config/cloudinaryConfig.js";

const FILE_URL_TTL_SECONDS = Math.max(Number(process.env.RESUME_FILE_URL_TTL_SECONDS || 300), 60);
const MAX_FILE_URL_TTL_SECONDS = Math.max(FILE_URL_TTL_SECONDS, 900);

const tokenSecret = () => process.env.RESUME_FILE_TOKEN_SECRET || process.env.JWT_SECRET || "";
const signatureFor = (resumeId, userId, expires) => crypto
    .createHmac("sha256", tokenSecret())
    .update(`${resumeId}.${userId}.${expires}`)
    .digest("base64url");

const safeEqual = (left, right) => {
    const a = Buffer.from(String(left || ""));
    const b = Buffer.from(String(right || ""));
    return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
};

const serverOrigin = (req) => {
    const configured = (process.env.SERVER_ORIGIN || "").trim().replace(/\/+$/, "");
    if (configured) return configured;
    return `${req.protocol}://${req.get("host")}`;
};

export const resumeFileUrl = (req, resume) => {
    const resumeId = String(resume?._id || "");
    const userId = String(resume?.user?._id || resume?.user || "");
    if (!resumeId || !userId || !tokenSecret()) return "";
    const expires = Math.floor(Date.now() / 1000) + FILE_URL_TTL_SECONDS;
    const signature = signatureFor(resumeId, userId, expires);
    return `${serverOrigin(req)}/api/resumes/${encodeURIComponent(resumeId)}/file?expires=${expires}&signature=${encodeURIComponent(signature)}`;
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

export const verifyResumeFileToken = (resume, expiresRaw, signature) => {
    const expires = Number(expiresRaw);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(expires) || expires < now || expires > now + MAX_FILE_URL_TTL_SECONDS) return false;
    const resumeId = String(resume?._id || "");
    const userId = String(resume?.user?._id || resume?.user || "");
    if (!resumeId || !userId || !tokenSecret()) return false;
    return safeEqual(signature, signatureFor(resumeId, userId, expires));
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
