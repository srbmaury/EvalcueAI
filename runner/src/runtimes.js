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

// Each runtime says how to run a single-file snippet and how to run a multi-file project's tests.
// Commands are argv arrays executed directly (no shell), relative to the job's working directory.
// A project test is a list of steps; every step must succeed, and the last one is the test itself.
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
            testSteps: (test) => [["node", "--test", test.path]],
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
            testSteps: (test) => [["python3", test.path]],
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
                const sources = files.filter((file) => file.path.endsWith(".java")).map((file) => file.path);
                return sources.length ? ["javac", ...JAVAC_FLAGS, "-d", ".build", ...sources] : null;
            },
            testSteps: (test) => [["java", ...JAVA_FLAGS, "-cp", ".build", javaQualifiedName(test)]],
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
            // Syntax-check the candidate's sources once so a broken project is reported as a compile error,
            // then link each test (which has its own main) against those sources.
            compile: (files) => {
                const sources = files.filter((file) => !file.test && CPP_SOURCE.test(file.path)).map((file) => file.path);
                return sources.length ? ["g++", ...CPP_FLAGS, "-fsyntax-only", ...sources] : null;
            },
            testSteps: (test, files, index) => {
                const sources = files.filter((file) => !file.test && CPP_SOURCE.test(file.path)).map((file) => file.path);
                const binary = `.build/test-${index}`;
                return [["g++", ...CPP_FLAGS, ...sources, test.path, "-o", binary], [`./${binary}`]];
            },
        },
    },
});

export const runtimeIds = () => Object.keys(RUNTIMES);

export const getRuntime = (id) => {
    const runtime = Object.hasOwn(RUNTIMES, id) ? RUNTIMES[id] : null;
    if (!runtime) throw Object.assign(new Error(`Unsupported runtime: ${id}`), { statusCode: 400 });
    return runtime;
};
