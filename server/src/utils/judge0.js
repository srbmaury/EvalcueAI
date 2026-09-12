export const buildJudge0SubmissionUrl = (rawUrl) => {
    const value = (rawUrl || "").toString().trim();
    if (!value) throw new Error("Judge0 is not configured");
    const url = new URL(value);
    url.searchParams.set("base64_encoded", "false");
    url.searchParams.set("wait", "true");
    return url.toString();
};
