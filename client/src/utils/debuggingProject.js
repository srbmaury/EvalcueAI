export const DEBUGGING_RUNTIMES = [
    { value: "node-22", label: "Node.js 22" },
    { value: "python-3", label: "Python 3" },
    { value: "java-21", label: "Java 21" },
    { value: "cpp-20", label: "C++20" },
];

export const normalizeProjectPath = (raw) => {
    const value = String(raw || "").replace(/\\/g, "/").trim().replace(/^\.\//, "");
    if (!value || value.startsWith("/") || /^[A-Za-z]:\//.test(value)) return "";
    const parts = value.split("/");
    if (parts.some((part) => !part || part === "." || part === "..")) return "";
    return parts.join("/");
};

const defaultSource = {
    "node-22": { path: "src/index.js", content: "export function solve(input) {\n  return input;\n}\n" },
    "python-3": { path: "src/main.py", content: "def solve(value):\n    return value\n" },
    "java-21": { path: "src/Main.java", content: "public class Main {\n    public static void main(String[] args) {\n    }\n}\n" },
    "cpp-20": { path: "src/main.cpp", content: "int main() {\n    return 0;\n}\n" },
};

export const createDebuggingRound = (runtime = "node-22") => {
    const starter = defaultSource[runtime] || defaultSource["node-22"];
    return {
        name: "Debugging",
        description: "Debug unfamiliar code and explain the root cause.",
        deliveryMode: "debugging",
        adaptive: false,
        questionCount: 1,
        aiPrompt: "",
        questions: [{ text: "", required: true }],
        debugging: {
            responseMode: "code_fix",
            runtime,
            entryFile: starter.path,
            files: [{ ...starter, kind: "source" }],
        },
    };
};

export const projectFolders = (files = []) => {
    const folders = new Set();
    for (const file of files) {
        const parts = String(file.path || "").split("/");
        parts.pop();
        let current = "";
        for (const part of parts) {
            current = current ? `${current}/${part}` : part;
            folders.add(current);
        }
    }
    return [...folders].sort();
};

export const addProjectFile = (files, rawPath, kind = "source", content = "") => {
    const path = normalizeProjectPath(rawPath);
    if (!path) throw new Error("Enter a valid relative file path");
    if (files.some((file) => normalizeProjectPath(file.path) === path)) throw new Error("A file already exists at this path");
    return [...files, { path, content, kind }];
};

export const addProjectFolder = (files, rawPath) => {
    const folder = normalizeProjectPath(rawPath);
    if (!folder) throw new Error("Enter a valid relative folder path");
    if (projectFolders(files).includes(folder)) throw new Error("That folder already exists");
    return addProjectFile(files, `${folder}/.gitkeep`, "source", "");
};

export const renameProjectPath = (files, rawFrom, rawTo) => {
    const from = normalizeProjectPath(rawFrom);
    const to = normalizeProjectPath(rawTo);
    if (!from || !to) throw new Error("Enter valid relative paths");
    const isFolder = projectFolders(files).includes(from);
    const matches = files.filter((file) => file.path === from || (isFolder && file.path.startsWith(`${from}/`)));
    if (!matches.length) throw new Error("Project path was not found");
    const replacements = new Map(matches.map((file) => [
        file.path,
        isFolder ? `${to}${file.path.slice(from.length)}` : to,
    ]));
    const result = files.map((file) => replacements.has(file.path) ? { ...file, path: replacements.get(file.path) } : file);
    const paths = result.map((file) => normalizeProjectPath(file.path));
    if (new Set(paths).size !== paths.length || paths.some((path) => !path)) throw new Error("Rename would create an invalid or duplicate path");
    return result;
};

export const deleteProjectPath = (files, rawPath) => {
    const path = normalizeProjectPath(rawPath);
    if (!path) return files;
    const isFolder = projectFolders(files).includes(path);
    return files.filter((file) => file.path !== path && !(isFolder && file.path.startsWith(`${path}/`)));
};

export const updateProjectFile = (files, path, patch) => files.map((file) => file.path === path ? { ...file, ...patch } : file);

export const languageForPath = (path, runtime = "node-22") => {
    const lower = String(path || "").toLowerCase();
    if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs") || lower.endsWith(".json")) return "javascript";
    if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript";
    if (lower.endsWith(".py")) return "python";
    if (lower.endsWith(".java")) return "java";
    if (/\.(cpp|cc|cxx|h|hpp)$/.test(lower)) return "cpp";
    if (lower.endsWith(".md")) return "markdown";
    return runtime === "python-3" ? "python" : runtime === "java-21" ? "java" : runtime === "cpp-20" ? "cpp" : "javascript";
};
