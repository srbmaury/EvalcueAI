import https from "https";
import Resume from "../models/Resume.js";
import { resumeStorageUrl } from "../services/resumeAccess.js";

const safeDownloadName = (value) => (value || "resume.pdf").replace(/[\r\n"\\/]/g, "_").slice(0, 180);

const streamResume = (res, resume) => {
    const sourceUrl = resumeStorageUrl(resume);
    if (!sourceUrl) return res.status(404).json({ message: "Resume unavailable" });
    res.setHeader("Content-Type", resume.fileType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${safeDownloadName(resume.fileName)}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Referrer-Policy", "no-referrer");

    const timeoutMs = Math.max(parseInt(process.env.RESUME_PREVIEW_TIMEOUT_MS || "10000", 10) || 10000, 1000);
    const request = https.get(sourceUrl, (upstream) => {
        if (upstream.statusCode && upstream.statusCode >= 400) {
            if (!res.headersSent) res.status(upstream.statusCode);
            res.end();
            return;
        }
        upstream.pipe(res);
    }).on("error", (error) => {
        console.error("Resume download stream error:", error);
        if (!res.headersSent) res.status(500);
        res.end();
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error("resume_stream_timeout")));
    return undefined;
};

export const downloadAuthenticatedResume = async (req, res, next) => {
    try {
        const resume = await Resume.findOne({ _id: req.params.id, user: req.user._id });
        if (!resume) return res.status(404).json({ message: "Resume not found" });
        return streamResume(res, resume);
    } catch (error) {
        return next(error instanceof Error ? error : new Error(String(error)));
    }
};

export default downloadAuthenticatedResume;
