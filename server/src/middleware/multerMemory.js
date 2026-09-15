import multer from "multer";

const storage = multer.memoryStorage(); // store file in buffer

const fileFilter = (allowedMimes) => (req, file, cb) => {
    if (!allowedMimes || allowedMimes.length === 0) return cb(null, true);
    if (allowedMimes.includes(file.mimetype)) return cb(null, true);
    const error = new Error("Unsupported file type");
    error.statusCode = 400;
    return cb(error);
};

export const upload = multer({ storage });

export const uploadResumeMulter = multer({
    storage,
    limits: { fileSize: Number(process.env.MAX_RESUME_BYTES || 5 * 1024 * 1024) },
    fileFilter: fileFilter(["application/pdf"]),
});

export const uploadFeedbackPhotosMulter = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per photo
    fileFilter: fileFilter(["image/jpeg", "image/png", "image/webp"]),
});

export const uploadAudioMulter = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: fileFilter([
        "audio/wav",
        "audio/x-wav",
        "audio/mpeg",
        "audio/ogg",
        "audio/webm",
        "application/octet-stream", // some browsers send generic type; validate length limit instead
    ]),
});
