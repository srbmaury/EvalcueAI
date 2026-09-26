// Runtimes offered for code execution. Ids are shared with the sandboxed runner service (/runner).
export const RUNTIME_LABELS = Object.freeze({
    "node-22": "Node.js 22",
    "python-3": "Python 3",
    "java-21": "Java 21",
    "cpp-20": "C++20",
});
export const RUNTIME_IDS = Object.freeze(Object.keys(RUNTIME_LABELS));

// Editor languages offered by the "Run code" button, mapped to runner runtimes.
export const SNIPPET_RUNTIMES = Object.freeze({ javascript: "node-22", python: "python-3", java: "java-21", cpp: "cpp-20" });
