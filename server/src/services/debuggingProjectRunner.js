import { validateDebuggingProject } from "./debuggingProject.js";
import { buildDebuggingRunScript, getDebuggingRuntimeProfile } from "./debuggingRuntimeProfiles.js";
import { executeJudge0Submission } from "../utils/runCode.js";

const MULTI_FILE_LANGUAGE_ID = 89;

const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        table[n] = c >>> 0;
    }
    return table;
})();

const crc32 = (buffer) => {
    let crc = 0xffffffff;
    for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
};

const zipStore = (entries) => {
    const locals = [];
    const centrals = [];
    let offset = 0;
    entries.forEach(({ name, content, executable = false }) => {
        const nameBuffer = Buffer.from(name, "utf8");
        const data = Buffer.isBuffer(content) ? content : Buffer.from(String(content), "utf8");
        const crc = crc32(data);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12);
        local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuffer.length, 26); local.writeUInt16LE(0, 28);
        locals.push(local, nameBuffer, data);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(0x0314, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(0, 10); central.writeUInt16LE(0, 12); central.writeUInt16LE(0, 14);
        central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuffer.length, 28); central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36);
        const mode = executable ? 0o100755 : 0o100644;
        central.writeUInt32LE((mode << 16) >>> 0, 38); central.writeUInt32LE(offset, 42);
        centrals.push(central, nameBuffer);
        offset += local.length + nameBuffer.length + data.length;
    });
    const centralBuffer = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(centralBuffer.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
    return Buffer.concat([...locals, centralBuffer, end]);
};

const filesForRun = (files, includeHiddenTests) => files.filter((file) => includeHiddenTests || file.kind !== "hidden_test");

export const buildDebuggingArchive = ({ files, runtime, includeHiddenTests = false }) => {
    const validated = validateDebuggingProject(files).files;
    const selected = filesForRun(validated, includeHiddenTests);
    const profile = getDebuggingRuntimeProfile(runtime);
    const runScript = buildDebuggingRunScript({ runtime, files: validated, includeHiddenTests });
    return zipStore([
        { name: "compile", content: profile.compileScript, executable: true },
        { name: "run", content: runScript, executable: true },
        ...selected.map((file) => ({ name: file.path, content: file.content })),
    ]);
};

const safeTestName = (value, index) => String(value || `Test ${index + 1}`).replace(/[\r\n|]+/g, " ").trim().slice(0, 120) || `Test ${index + 1}`;

const protocolFromOutput = (stdout, defaults) => {
    const output = String(stdout || "");
    const tests = output.split("\n")
        .filter((line) => line.startsWith("__EVALCUE_TEST__"))
        .slice(0, 100)
        .map((line, index) => {
            const payload = line.slice("__EVALCUE_TEST__".length);
            const separator = payload.indexOf("|");
            if (separator < 0) return null;
            return { passed: payload.slice(0, separator) === "1", name: safeTestName(payload.slice(separator + 1), index) };
        })
        .filter(Boolean);
    const countLine = output.split("\n").find((line) => line.startsWith("__EVALCUE_COUNTS__"));
    if (!countLine) return { ...defaults, protocolComplete: false };
    const [passed, total] = countLine.slice("__EVALCUE_COUNTS__".length).split(",").map((value) => Math.max(0, Number(value) || 0));
    const safeTests = tests.length === total ? tests : defaults.tests.map((test, index) => tests[index] || test);
    return { passed, total, tests: safeTests.slice(0, total), protocolComplete: true };
};

const normalizeStatus = (execution, result) => {
    if (result.protocolComplete) return result.passed === result.total ? "passed" : "failed";
    const description = String(execution?.status?.description || "");
    if (/time limit|timeout/i.test(description)) return "timeout";
    if (/compilation/i.test(description) || execution?.errorType === "compile" || execution?.compileOutput) return "compile_error";
    if (/runtime/i.test(description) || execution?.errorType === "runtime") return "runtime_error";
    return result.passed === result.total ? "passed" : "failed";
};

export const runDebuggingProject = async ({ files, runtime, includeHiddenTests = false }) => {
    const validated = validateDebuggingProject(files).files;
    const runnableTests = includeHiddenTests ? validated.filter((file) => file.kind === "hidden_test") : [];
    const defaultTests = runnableTests.map((file, index) => ({ name: safeTestName(file.displayName, index), passed: false }));
    const archive = buildDebuggingArchive({ files: validated, runtime, includeHiddenTests });
    let execution;
    try {
        execution = await executeJudge0Submission({ language_id: MULTI_FILE_LANGUAGE_ID, additional_files: archive.toString("base64") }, { metricLanguage: `debugging-${runtime}` });
    } catch (error) {
        if (error?.statusCode === 504) return { status: "timeout", passed: 0, total: defaultTests.length, tests: defaultTests };
        throw error;
    }
    const defaults = {
        passed: execution.isError ? 0 : defaultTests.length,
        total: defaultTests.length,
        tests: execution.isError ? defaultTests : defaultTests.map((test) => ({ ...test, passed: true })),
    };
    const result = protocolFromOutput(execution.stdout, defaults);
    return {
        status: normalizeStatus(execution, result),
        passed: result.passed,
        total: result.total,
        tests: result.tests,
    };
};

export const DEBUGGING_MULTI_FILE_LANGUAGE_ID = MULTI_FILE_LANGUAGE_ID;
