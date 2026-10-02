import Resume from "../models/Resume.js";
import ResumeReview from "../models/ResumeReview.js";
import cloudinary from "../config/cloudinaryConfig.js";
import streamifier from "streamifier";
import { parseFile } from "../utils/parseFile.js";
import https from "https";
import { assertPdfMagic } from "../utils/magicBytes.js";
import metrics from "../metrics/index.js";
import { generateJSON } from "../utils/generateQuestions/aiClient.js";
import { rankResumesForJob } from "../services/resumeMatcher.js";
import { publicResume, resumeStorageUrl } from "../services/resumeAccess.js";
import { optionalAntivirusScan } from "../utils/avScan.js";

// Align with multer filter (PDF only) and use single source of truth for max bytes
const ALLOWED_MIME = ["application/pdf"];
const MAX_BYTES = Number(process.env.MAX_RESUME_BYTES || 5 * 1024 * 1024); // default 5MB
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const safeDownloadName = (value) => (value || "resume.pdf").replace(/[\r\n"\\/]/g, "_").slice(0, 180);

const streamResume = (res, resume, disposition = "inline") => {
    const sourceUrl = resumeStorageUrl(resume);
    if (!sourceUrl) {
        res.status(404).end();
        return;
    }
    res.setHeader("Content-Type", resume.fileType || "application/octet-stream");
    res.setHeader("Content-Disposition", `${disposition}; filename="${safeDownloadName(resume.fileName)}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    const reqTimeoutMs = Math.max(parseInt(process.env.RESUME_PREVIEW_TIMEOUT_MS || "10000", 10) || 10000, 1000);
    const httpReq = https.get(sourceUrl, (r) => {
        if (r.statusCode && r.statusCode >= 400) {
            if (!res.headersSent) res.status(r.statusCode);
            res.end();
            return;
        }
        r.pipe(res);
    }).on("error", (err) => {
        console.error("Resume stream error:", err);
        if (!res.headersSent) res.status(500);
        res.end();
    });
    httpReq.setTimeout(reqTimeoutMs, () => {
        try { httpReq.destroy(new Error("resume_stream_timeout")); } catch {}
        try { if (!res.headersSent) res.status(504).end(); } catch {}
    });
};

// Upload resume
export const uploadResume = async (req, res, next) => {
    let uploaded;
    try {
        if (!req.file)
            return res.status(400).json({ message: "No file uploaded" });

        if (!ALLOWED_MIME.includes(req.file.mimetype)) {
            return res.status(400).json({ message: "Unsupported file type" });
        }
        if (req.file.size > MAX_BYTES) {
            return res.status(400).json({ message: "File too large" });
        }
        try {
            if (req.file.mimetype === "application/pdf") {
                assertPdfMagic(req.file.buffer);
            }
        } catch (e) {
            return res.status(400).json({ message: e?.message || "Invalid file" });
        }
        const av = await optionalAntivirusScan(req.file.buffer);
        if (!av.clean) {
            return res.status(400).json({ message: "File failed security scan" });
        }

        // Extract text from file buffer
        const extractedText = await parseFile(req.file.buffer, req.file.mimetype);

        // Upload as an authenticated Cloudinary asset. The underlying storage URL
        // is never returned to clients; downloads are proxied by this API.
        const streamUpload = (fileBuffer) => {
            return new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    {
                        resource_type: "raw",
                        type: "authenticated",
                        folder: "resumes",
                    },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    }
                );
                streamifier.createReadStream(fileBuffer).pipe(stream);
            });
        };

        uploaded = await streamUpload(req.file.buffer);

        // Save resume in DB
        const resume = await Resume.create({
            user: req.user._id,
            fileUrl: uploaded.secure_url,
            publicId: uploaded.public_id,
            deliveryType: "authenticated",
            fileName: req.file.originalname,
            fileType: req.file.mimetype,
            fileSize: req.file.size,
            extractedText,
        });
        try { metrics.uploadResumeTotal.labels("success").inc(); } catch {}

        return res.status(201).json(publicResume(req, resume));
    } catch (error) {
        if (uploaded?.public_id) {
            await cloudinary.uploader.destroy(uploaded.public_id, { resource_type: "raw", type: "authenticated" }).catch(() => {});
        }
        console.error("Resume upload error:", error);
        try { metrics.uploadResumeTotal.labels("failure").inc(); } catch {}
        return next(error instanceof Error ? error : new Error(String(error)));
    }
};

// Fetch all resumes for a user
export const getUserResumes = async (req, res, next) => {
    try {
        const { sort = "-createdAt", tag, q } = req.query || {};
        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
        const query = { user: req.user._id };
        if (tag) query.tags = tag;
        if (q) query.$or = [
            { fileName: new RegExp(escapeRegex(q.slice(0, 100)), "i") },
            { notes: new RegExp(escapeRegex(q.slice(0, 100)), "i") },
        ];
        const sortSpec = {};
        const field = sort.replace(/^-/, "");
        const dir = sort.startsWith("-") ? -1 : 1;
        if (["createdAt", "fileName"].includes(field)) sortSpec[field] = dir;

        const [items, total] = await Promise.all([
            Resume.find(query).sort(sortSpec).skip((page - 1) * limit).limit(limit).lean(),
            Resume.countDocuments(query),
        ]);
        res.json({ items: items.map((item) => publicResume(req, item)), total, page, limit, totalPages: Math.max(Math.ceil(total / limit), 1) });
    } catch (error) {
        console.error("Fetch resumes error:", error);
        return next(error instanceof Error ? error : new Error(String(error)));
    }
};

// Delete resume
export const deleteResume = async (req, res, next) => {
    try {
        const resume = await Resume.findOne({
            _id: req.params.id,
            user: req.user._id,
        });
        if (!resume)
            return res.status(404).json({ message: "Resume not found" });

        // Remove from Cloudinary (raw resource)
        try {
            if (resume.publicId) {
                await cloudinary.uploader.destroy(resume.publicId, { resource_type: "raw", type: resume.deliveryType || "upload" });
            }
        } catch (e) {
            console.warn("Cloudinary destroy failed:", e?.message || e);
        }

        await Resume.deleteOne({ _id: req.params.id });
        res.json({ message: "Resume deleted" });
    } catch (error) {
        console.error("Delete resume error:", error);
        return next(error instanceof Error ? error : new Error(String(error)));
    }
};

// View resume

// Stream PDF inline for authenticated preview
export const previewResume = async (req, res, next) => {
    try {
        const resume = await Resume.findOne({ _id: req.params.id, user: req.user._id });
        if (!resume) return res.status(404).json({ message: "Resume not found" });
        if (resume.fileType !== "application/pdf") {
            return res.status(400).json({ message: "Preview available for PDFs only" });
        }
        return streamResume(res, resume, "inline");
    } catch (error) {
        console.error("Preview resume error:", error);
        return next(error instanceof Error ? error : new Error(String(error)));
    }
};

// Update resume metadata (rename, tags, notes)
export const updateResume = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { fileName, tags, notes } = req.body || {};
        const resume = await Resume.findOne({ _id: id, user: req.user._id });
        if (!resume) return res.status(404).json({ message: "Resume not found" });

        if (typeof fileName === "string" && fileName.trim()) {
            resume.fileName = fileName.trim();
        }
        if (Array.isArray(tags)) {
            resume.tags = tags.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim());
        }
        if (typeof notes === "string") {
            resume.notes = notes;
        }
        await resume.save();
        res.json(publicResume(req, resume));
    } catch (error) {
        console.error("Update resume error:", error);
        return next(error instanceof Error ? error : new Error(String(error)));
    }
};

// Generate AI review for a resume
export const reviewResume = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { role, jobDescription } = req.body || {};

        // role and jobDescription are optional; AI will infer based on resume when missing

        const resume = await Resume.findOne({ _id: id, user: req.user._id });
        if (!resume) return res.status(404).json({ message: "Resume not found" });

        const resumeText = (resume.extractedText || "").toString().slice(0, 30000);
        const safeRole = (role || "").toString().slice(0, 200);
        const safeJD = (jobDescription || "").toString().slice(0, 12000);

        const prompt = `You are an expert technical recruiter and hiring manager.
Return ONLY JSON with this exact shape:
{
  "summary": string,
  "atsScore": number, // 0-100
  "strengths": string[], // max 8
  "gaps": string[], // max 8
  "keywordsMatched": string[], // max 20
  "improvementSuggestions": string[], // max 8
  "roleAlignment": string
}
Use clear, concise language. No markdown. No code fences. Be constructive.
The resume owner reads this review: write summary, gaps, improvementSuggestions, and roleAlignment in second person ("Your resume shows…", "Add…"), never "the candidate".
Base every strength and gap only on RESUME_TEXT. A point must not appear as both a strength and a gap; if evidence is partial, list it once as a gap that says what is missing.
keywordsMatched must contain only job-description terms that literally appear (or have an obvious synonym) in RESUME_TEXT; job-description terms missing from the resume belong in gaps, not keywordsMatched.

ROLE: ${safeRole || "(not provided)"}
JOB_DESCRIPTION: ${safeJD || "(not provided)"}
RESUME_TEXT: ${resumeText}`;

        let json = await generateJSON(prompt);
        if (!json) json = "{}";
        let parsed;
        try { parsed = JSON.parse(json); } catch (_) { parsed = {}; }

        // Normalize result
        const response = {
            summary: (parsed?.summary || "Review unavailable.").toString().slice(0, 2000),
            atsScore: Math.max(0, Math.min(100, Number(parsed?.atsScore) || 0)),
            strengths: Array.isArray(parsed?.strengths) ? parsed.strengths.map((s) => (s || "").toString().slice(0, 200)).filter(Boolean).slice(0, 8) : [],
            gaps: Array.isArray(parsed?.gaps) ? parsed.gaps.map((s) => (s || "").toString().slice(0, 200)).filter(Boolean).slice(0, 8) : [],
            keywordsMatched: Array.isArray(parsed?.keywordsMatched) ? parsed.keywordsMatched.map((s) => (s || "").toString().slice(0, 80)).filter(Boolean).slice(0, 20) : [],
            improvementSuggestions: Array.isArray(parsed?.improvementSuggestions) ? parsed.improvementSuggestions.map((s) => (s || "").toString().slice(0, 200)).filter(Boolean).slice(0, 8) : [],
            roleAlignment: (parsed?.roleAlignment || "").toString().slice(0, 2000),
        };

        const saved = await ResumeReview.create({
            user: req.user._id,
            resume: resume._id,
            resumeName: resume.fileName,
            role: safeRole,
            jobDescription: safeJD,
            ...response,
        });
        res.json({ ...response, _id: saved._id, createdAt: saved.createdAt });
    } catch (error) {
        console.error("Review resume error:", error);
        return next(error instanceof Error ? error : new Error(String(error)));
    }
};

export const matchResumesToJob = async (req, res, next) => {
    try {
        const resumes = await Resume.find({ user: req.user._id }).sort({ updatedAt: -1 }).limit(50).lean();
        if (!resumes.length) return res.status(400).json({ message: "Upload at least one resume before finding a match." });
        const matches = rankResumesForJob(resumes, req.body);
        return res.json({
            role: req.body.role || "",
            resumeCount: matches.length,
            bestResumeId: matches[0]?.resumeId || null,
            matches,
            methodology: "Scores represent weighted keyword coverage from the job description. Review the supporting evidence before deciding.",
        });
    } catch (error) { return next(error instanceof Error ? error : new Error(String(error))); }
};

export const getResumeReviews = async (req, res, next) => {
    try {
        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 50);
        const query = { user: req.user._id };
        const [items, total] = await Promise.all([
            ResumeReview.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
            ResumeReview.countDocuments(query),
        ]);
        return res.json({ items, total, page, limit, totalPages: Math.max(Math.ceil(total / limit), 1) });
    } catch (error) { return next(error instanceof Error ? error : new Error(String(error))); }
};

export const deleteResumeReview = async (req, res, next) => {
    try {
        const deleted = await ResumeReview.findOneAndDelete({ _id: req.params.reviewId, user: req.user._id });
        if (!deleted) return res.status(404).json({ message: "Review not found" });
        return res.json({ message: "Review deleted" });
    } catch (error) { return next(error instanceof Error ? error : new Error(String(error))); }
};
