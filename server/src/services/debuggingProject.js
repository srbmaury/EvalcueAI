import crypto from "crypto";

export const PROJECT_LIMITS = Object.freeze({
    maxFiles: 100,
    maxFileBytes: 256 * 1024,
    maxProjectBytes: 2 * 1024 * 1024,
});

const ALLOWED_KINDS = new Set(["source", "visible_test", "hidden_test"]);

const projectError = (message) => {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
};

export const normalizeProjectPath = (value) => {
    if (typeof value !== "string") throw projectError("Project file path must be a string");
    const normalized = value.replace(/\\/g, "/").trim();
    if (!normalized) throw projectError("Project file path cannot be empty");
    if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
        throw projectError("Project file path must be relative");
    }
    const parts = normalized.split("/");
    if (parts.some((part) => !part || part === "." || part === "..")) {
        throw projectError("Project file path contains an invalid path segment");
    }
    return parts.join("/");
};

const normalizeFile = (file) => {
    const path = normalizeProjectPath(file?.path);
    const content = typeof file?.content === "string" ? file.content : "";
    const kind = file?.kind || "source";
    if (!ALLOWED_KINDS.has(kind)) throw projectError(`Unsupported project file kind for ${path}`);
    const bytes = Buffer.byteLength(content, "utf8");
    if (bytes > PROJECT_LIMITS.maxFileBytes) {
        throw projectError(`Project files may not exceed 256 KB: ${path}`);
    }
    return { path, content, kind, bytes };
};

export const validateDebuggingProject = (inputFiles) => {
    if (!Array.isArray(inputFiles)) throw projectError("Project files must be an array");
    if (inputFiles.length > PROJECT_LIMITS.maxFiles) {
        throw projectError("Debugging projects support at most 100 files");
    }

    const seen = new Set();
    let totalBytes = 0;
    const files = inputFiles.map((input) => {
        const normalized = normalizeFile(input);
        if (seen.has(normalized.path)) throw projectError(`Duplicate project file path: ${normalized.path}`);
        seen.add(normalized.path);
        totalBytes += normalized.bytes;
        if (totalBytes > PROJECT_LIMITS.maxProjectBytes) {
            throw projectError("Debugging projects may not exceed 2 MB total source");
        }
        return { path: normalized.path, content: normalized.content, kind: normalized.kind };
    });

    return { files, totalBytes };
};

export const sanitizeProjectForCandidate = (files) =>
    validateDebuggingProject(files).files
        .filter((file) => file.kind !== "hidden_test")
        .map((file) => ({ ...file }));

const normalizeOverlayFile = (file) => {
    const path = normalizeProjectPath(file?.path);
    const content = typeof file?.content === "string" ? file.content : "";
    const bytes = Buffer.byteLength(content, "utf8");
    if (bytes > PROJECT_LIMITS.maxFileBytes) {
        throw projectError(`Project files may not exceed 256 KB: ${path}`);
    }
    return { path, content };
};

const normalizeOverlay = (overlay = {}) => ({
    changedFiles: Array.isArray(overlay.changedFiles) ? overlay.changedFiles.map(normalizeOverlayFile) : [],
    createdFiles: Array.isArray(overlay.createdFiles) ? overlay.createdFiles.map(normalizeOverlayFile) : [],
    deletedFiles: Array.isArray(overlay.deletedFiles) ? overlay.deletedFiles.map(normalizeProjectPath) : [],
});

export const applyDebuggingOverlay = (baseFiles, overlay = {}) => {
    const base = validateDebuggingProject(baseFiles).files;
    const normalizedOverlay = normalizeOverlay(overlay);
    const byPath = new Map(base.map((file) => [file.path, { ...file }]));

    const touched = new Set();
    for (const file of normalizedOverlay.changedFiles) {
        if (touched.has(file.path)) throw projectError(`Duplicate candidate change for ${file.path}`);
        touched.add(file.path);
        const existing = byPath.get(file.path);
        if (!existing) throw projectError(`Cannot change unknown project file: ${file.path}`);
        if (existing.kind === "hidden_test") throw projectError("Candidates cannot change hidden test files");
        if (existing.kind === "visible_test") throw projectError("Candidates cannot change visible test files");
        byPath.set(file.path, { ...existing, content: file.content });
    }

    for (const path of normalizedOverlay.deletedFiles) {
        if (touched.has(path)) throw projectError(`Conflicting candidate change for ${path}`);
        touched.add(path);
        const existing = byPath.get(path);
        if (!existing) throw projectError(`Cannot delete unknown project file: ${path}`);
        if (existing.kind === "hidden_test") throw projectError("Candidates cannot delete hidden test files");
        if (existing.kind === "visible_test") throw projectError("Candidates cannot delete visible test files");
        byPath.delete(path);
    }

    for (const file of normalizedOverlay.createdFiles) {
        if (touched.has(file.path) || byPath.has(file.path)) throw projectError(`Project file already exists: ${file.path}`);
        touched.add(file.path);
        byPath.set(file.path, { path: file.path, content: file.content, kind: "source" });
    }

    return validateDebuggingProject([...byPath.values()]).files;
};

export const summarizeDebuggingDiff = (baseFiles, overlay = {}) => {
    validateDebuggingProject(baseFiles);
    const normalized = normalizeOverlay(overlay);
    applyDebuggingOverlay(baseFiles, normalized);
    return {
        changed: normalized.changedFiles.length,
        created: normalized.createdFiles.length,
        deleted: normalized.deletedFiles.length,
        paths: {
            changed: normalized.changedFiles.map((file) => file.path),
            created: normalized.createdFiles.map((file) => file.path),
            deleted: [...normalized.deletedFiles],
        },
    };
};

export const fingerprintDebuggingProject = (files) => {
    const normalized = validateDebuggingProject(files).files
        .map((file) => ({ path: file.path, content: file.content, kind: file.kind }))
        .sort((a, b) => a.path.localeCompare(b.path));
    return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
};
