import path from "node:path";

// JVM defaults assume a whole machine; keep startup fast and memory inside the sandbox's cgroup limit.
const JAVA_FLAGS = ["-Xmx256m", "-XX:+UseSerialGC", "-XX:TieredStopAtLevel=1", "-XX:-UsePerfData"];
const JAVAC_FLAGS = [...JAVA_FLAGS.map((flag) => `-J${flag}`), "-encoding", "UTF-8", "-nowarn"];
const CPP_FLAGS = ["-std=c++20", "-O1", "-I."];
const CPP_SOURCE = /\.(cc|cpp|cxx)$/i;

const javaPublicClass = (source) => /\bpublic\s+(?:(?:final|abstract|sealed|non-sealed|strictfp)\s+)*(?:class|record|enum|interface)\s+([A-Za-z_$][\w$]*)/.exec(source)?.[1] || null;

const javaQualifiedName = (file) => {
    const pkg = /^\s*package\s+([\w.]+)\s*;/m.exec(file.content)?.[1];
    const name = path.posix.basename(file.path, ".java");
    return pkg ? `${pkg}.${name}` : name;
};

// Each runtime says how to run a single-file snippet and how to run a multi-file project entry point.
// Commands are argv arrays executed directly (no shell), relative to the job's working directory.
export const RUNTIMES = Object.freeze({
    "node-22": {
        label: "Node.js 22",
        version: ["node", "--version"],
        snippet: {
            fileName: () => "main.js",
            run: (file) => ["node", file],
        },
        project: {
            compile: () => null,
            entryCommand: (entry) => ["node", "--", entry.path],
        },
    },
    "python-3": {
        label: "Python 3.12",
        version: ["python3", "--version"],
        snippet: {
            fileName: () => "main.py",
            run: (file) => ["python3", file],
        },
        project: {
            compile: () => null,
            entryCommand: (entry) => ["python3", "--", entry.path],
        },
    },
    "java-21": {
        label: "Java 21",
        version: ["java", "--version"],
        snippet: {
            fileName: (source) => `${javaPublicClass(source) || "Main"}.java`,
            compile: (file) => ["javac", ...JAVAC_FLAGS, "-d", ".", file],
            run: (file) => ["java", ...JAVA_FLAGS, "-cp", ".", path.posix.basename(file, ".java")],
        },
        project: {
            compile: (files) => {
                const sources = files.filter((file) => file.path.endsWith(".java")).map((file) => `./${file.path}`);
                return sources.length ? ["javac", ...JAVAC_FLAGS, "-d", ".build", ...sources] : null;
            },
            entryCommand: (entry) => ["java", ...JAVA_FLAGS, "-cp", ".build", javaQualifiedName(entry)],
        },
    },
    "cpp-20": {
        label: "C++20 (GCC)",
        version: ["g++", "--version"],
        snippet: {
            fileName: () => "main.cpp",
            compile: (file) => ["g++", ...CPP_FLAGS, "-o", "main", file],
            run: () => ["./main"],
        },
        project: {
            compile: (files) => ["g++", ...CPP_FLAGS, ...files.filter((file) => CPP_SOURCE.test(file.path)).map((file) => `./${file.path}`), "-o", ".build/main"],
            entryCommand: () => ["./.build/main"],
        },
    },
});

export const runtimeIds = () => Object.keys(RUNTIMES);

export const getRuntime = (id) => {
    const runtime = Object.hasOwn(RUNTIMES, id) ? RUNTIMES[id] : null;
    if (!runtime) throw Object.assign(new Error(`Unsupported runtime: ${id}`), { statusCode: 400 });
    return runtime;
};
