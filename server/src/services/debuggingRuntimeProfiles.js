const profiles = Object.freeze({
    "node-22": Object.freeze({
        runtime: "node-22",
        label: "Node.js 22",
        // The runner's toolchain must match the label; print only on failure (any compile output is treated as an error).
        compileScript: "#!/bin/sh\nset -eu\nnode -e 'process.exit(Number(process.versions.node.split(\".\")[0]) >= 18 ? 0 : 1)' || { echo \"EVALCUE_RUNTIME: Node.js 18 or newer is required, but the code runner provides Node $(node --version).\" >&2; exit 2; }\n",
        testCommand(path) { return `node --test ${shellQuote(path)}`; },
    }),
    "python-3": Object.freeze({
        runtime: "python-3",
        label: "Python 3",
        compileScript: "#!/bin/sh\nset -eu\npython3 --version >/dev/null\n",
        testCommand(path) { return `python3 ${shellQuote(path)}`; },
    }),
    "java-21": Object.freeze({
        runtime: "java-21",
        label: "Java 21",
        compileScript: "#!/bin/sh\nset -eu\nv=$(java -version 2>&1 | head -n 1 | sed -E 's/[^\"]*\"([0-9]+).*/\\1/')\n[ \"$v\" -ge 21 ] 2>/dev/null || { echo \"EVALCUE_RUNTIME: Java 21 is required, but the code runner provides Java $v.\" >&2; exit 2; }\nrm -rf .evalcue-build\nmkdir -p .evalcue-build\nfiles=$(find . -name '*.java' -type f -not -path './.evalcue/*')\n[ -n \"$files\" ] || { echo 'No Java files found' >&2; exit 2; }\njavac -d .evalcue-build $files\n",
        testCommand(path) {
            const quoted = shellQuote(path);
            return `f=${quoted}; pkg=$(sed -n 's/^[[:space:]]*package[[:space:]]\\+\\([^;]*\\);.*/\\1/p' \"$f\" | head -n 1); cls=$(basename \"$f\" .java); [ -z \"$pkg\" ] || cls=\"$pkg.$cls\"; java -cp .evalcue-build \"$cls\"`;
        },
    }),
    "cpp-20": Object.freeze({
        runtime: "cpp-20",
        label: "C++20",
        compileScript: "#!/bin/sh\nset -eu\nv=$(g++ -dumpversion | cut -d. -f1)\n[ \"$v\" -ge 10 ] 2>/dev/null || { echo \"EVALCUE_RUNTIME: C++20 needs g++ 10 or newer, but the code runner provides g++ $v.\" >&2; exit 2; }\n",
        testCommand(path, sourceFiles = [], index = 0) {
            const cppSources = sourceFiles.filter((file) => /\.(cc|cpp|cxx)$/i.test(file.path)).map((file) => shellQuote(file.path));
            const output = `/tmp/evalcue-cpp-test-${index}`;
            return `g++ -std=c++20 ${cppSources.join(" ")} ${shellQuote(path)} -o ${shellQuote(output)} && ${shellQuote(output)}`;
        },
    }),
});

export function shellQuote(value) {
    return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

export const getDebuggingRuntimeProfile = (runtime) => {
    const profile = profiles[runtime];
    if (!profile) {
        const error = new Error(`Unsupported debugging runtime: ${runtime || "unknown"}`);
        error.statusCode = 400;
        throw error;
    }
    return profile;
};

// Deployments whose code runner lacks a toolchain (e.g. public Judge0 CE ships Node 12, Java 13, g++ 8)
// can restrict new debugging assignments with DEBUGGING_RUNTIMES, e.g. "python-3". Unset means all.
export const enabledDebuggingRuntimeIds = () => {
    const configured = String(process.env.DEBUGGING_RUNTIMES || "").split(",").map((value) => value.trim()).filter(Boolean);
    const known = Object.keys(profiles);
    const enabled = configured.filter((runtime) => known.includes(runtime));
    return enabled.length ? enabled : known;
};

export const supportedDebuggingRuntimes = () => enabledDebuggingRuntimeIds().map((runtime) => ({ runtime, label: profiles[runtime].label }));

// Failures caused by a broken project (missing module, syntax/compile error) rather than a failing
// assertion. Publishing validation must not treat these as a reproduced bug.
const SETUP_FAILURE_PATTERN = "ERR_MODULE_NOT_FOUND|Cannot find module|SyntaxError|ModuleNotFoundError|ImportError|IndentationError|error: cannot find symbol|fatal error:|undefined reference";

export const buildDebuggingRunScript = ({ runtime, files, includeHiddenTests }) => {
    const profile = getDebuggingRuntimeProfile(runtime);
    const sourceFiles = files.filter((file) => file.kind === "source");
    const tests = includeHiddenTests ? files.filter((file) => file.kind === "hidden_test") : [];

    const lines = [
        "#!/bin/sh",
        "set -u",
        `test_total=${tests.length}`,
        "test_passed=0",
    ];

    tests.forEach((file, index) => {
        const command = profile.testCommand(file.path, sourceFiles, index);
        const name = String(file.displayName || `Test ${index + 1}`).trim().slice(0, 120) || `Test ${index + 1}`;
        lines.push(`if ( ${command} ) >/tmp/evalcue-test-${index}.log 2>&1; then test_passed=$((test_passed + 1)); printf '__EVALCUE_TEST__1|%s\\n' ${shellQuote(name)}; else if grep -Eq ${shellQuote(SETUP_FAILURE_PATTERN)} /tmp/evalcue-test-${index}.log; then printf '__EVALCUE_SETUP_ERROR__\\n'; fi; printf '__EVALCUE_TEST__0|%s\\n' ${shellQuote(name)}; fi`);
    });

    lines.push("printf '__EVALCUE_COUNTS__%s,%s\\n' \"$test_passed\" \"$test_total\"");
    lines.push("[ \"$test_passed\" -eq \"$test_total\" ]");
    return `${lines.join("\n")}\n`;
};
