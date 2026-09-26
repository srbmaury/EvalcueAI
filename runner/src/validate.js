import path from "node:path";
import { LIMITS } from "./config.js";
import { getRuntime } from "./runtimes.js";

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

const byteLength = (value) => Buffer.byteLength(value, "utf8");

// Paths are written under the job directory, so they must be relative and stay inside it.
export const safeRelativePath = (value) => {
    if (typeof value !== "string" || !value || value.length > 300) throw badRequest("Invalid file path");
    if (value.includes("\0") || value.includes("\\") || value.startsWith("/")) throw badRequest(`Invalid file path: ${value}`);
    const normalized = path.posix.normalize(value);
    if (normalized !== value || normalized.startsWith("..") || normalized.startsWith(".build")) throw badRequest(`Invalid file path: ${value}`);
    if (!/^[\w./ -]+$/.test(normalized)) throw badRequest(`Invalid file path: ${value}`);
    return normalized;
};

export const parseSnippet = (body) => {
    const { runtime, source, stdin = "" } = body || {};
    getRuntime(runtime);
    if (typeof source !== "string" || !source.trim()) throw badRequest("source is required");
    if (byteLength(source) > LIMITS.maxSourceBytes) throw badRequest("source is too large");
    if (typeof stdin !== "string" || byteLength(stdin) > LIMITS.maxStdinBytes) throw badRequest("stdin is invalid or too large");
    return { runtime, source, stdin };
};

export const parseProject = (body) => {
    const { runtime, files, tests } = body || {};
    getRuntime(runtime);
    if (!Array.isArray(files) || !files.length || files.length > LIMITS.maxFiles) throw badRequest(`files must contain 1-${LIMITS.maxFiles} entries`);
    if (!Array.isArray(tests) || !tests.length || tests.length > LIMITS.maxTests) throw badRequest(`tests must contain 1-${LIMITS.maxTests} entries`);

    const seen = new Set();
    let total = 0;
    const parsedFiles = files.map((file) => {
        const filePath = safeRelativePath(file?.path);
        if (seen.has(filePath)) throw badRequest(`Duplicate file path: ${filePath}`);
        seen.add(filePath);
        if (typeof file.content !== "string") throw badRequest(`Missing content: ${filePath}`);
        total += byteLength(file.content);
        return { path: filePath, content: file.content };
    });
    if (total > LIMITS.maxProjectBytes) throw badRequest("Project is too large");

    const testPaths = new Set();
    const parsedTests = tests.map((test, index) => {
        const testPath = safeRelativePath(test?.path);
        if (!seen.has(testPath)) throw badRequest(`Test file is not in the project: ${testPath}`);
        testPaths.add(testPath);
        return { path: testPath, name: String(test.name || `Test ${index + 1}`).slice(0, 120) };
    });
    return { runtime, files: parsedFiles.map((file) => ({ ...file, test: testPaths.has(file.path) })), tests: parsedTests };
};
