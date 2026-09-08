export const maxResumeBytes = () => Number(import.meta.env.VITE_MAX_RESUME_BYTES || 5 * 1024 * 1024);

export const resumeFileError = (file) => {
    if (!file) return "Choose a PDF resume first.";
    if (file.type !== "application/pdf" && !file.name?.toLowerCase().endsWith(".pdf")) {
        return "Please choose a PDF file.";
    }
    const maxBytes = maxResumeBytes();
    if (file.size > maxBytes) {
        return `The file must be ${Math.floor(maxBytes / 1024 / 1024)} MB or smaller.`;
    }
    return "";
};
