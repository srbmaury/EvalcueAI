export const MAX_FEEDBACK_PHOTOS = 4;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const feedbackPhotosError = (existingCount, newFiles) => {
    if (existingCount + newFiles.length > MAX_FEEDBACK_PHOTOS) {
        return `You can attach up to ${MAX_FEEDBACK_PHOTOS} photos.`;
    }
    for (const file of newFiles) {
        if (!ALLOWED_TYPES.includes(file.type)) return "Photos must be JPEG, PNG, or WEBP.";
        if (file.size > MAX_PHOTO_BYTES) return "Each photo must be 5 MB or smaller.";
    }
    return "";
};
