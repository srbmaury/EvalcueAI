/**
 * Consistently formats error messages from API responses or exceptions
 * @param {Error|Object} error - The error object (typically from axios)
 * @param {string} fallback - The fallback message to use if no message is found
 * @returns {string} The formatted error message
 */
export function describeError(error, fallback) {
    if (!error) return fallback || "An error occurred";

    // Try to get message from API response
    const apiMessage = error?.response?.data?.message;
    if (apiMessage && apiMessage !== "Invalid request") {
        // "Invalid request" is a generic validation error message that isn't user-friendly.
        // Prefer the fallback for better UX.
        return apiMessage;
    }

    // Try to get message from error object
    if (error?.message) {
        return error.message;
    }

    // Fallback to provided fallback or generic message
    return fallback || "An error occurred";
}
