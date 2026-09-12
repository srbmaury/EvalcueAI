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

const countsFromOutput = (stdout, defaults) => {
    const output = String(stdout || "");
    const jsonMarker = output.split("\n").find((line) => line.startsWith("__EVALCUE_RESULT__"));
    if (jsonMarker) {
        try {
            const parsed = JSON.parse(jsonMarker.slice("__EVALCUE_RESULT__".length));
            return {
                visiblePassed: Number(parsed.visiblePassed) || 0,
                visibleTotal: Number(parsed.visibleTotal) || 0,
                hiddenPassed: Number(parsed.hiddenPassed) || 0,
                hiddenTotal: Number(parsed.hiddenTotal) || 0,
                visibleFailures: Array.isArray(parsed.visibleFailures) ? parsed.visibleFailures.slice(0, 50).map((failure) => ({ name: String(failure?.name || "Visible test").slice(0, 200), message: String(failure?.message || "Test failed").slice(0, 5000) })) : [],
                protocolComplete: true,
            };
        } catch { /* use line protocol below */ }
    }
    const countLine = output.split("\n").find((line) => line.startsWith("__EVALCUE_COUNTS__"));
    const visibleFailures = output.split("\n").filter((line) => line.startsWith("__EVALCUE_VISIBLE_FAIL__")).map((line) => ({ name: line.slice("__EVALCUE_VISIBLE_FAIL__".length).slice(0, 200) || "Visible test", message: "Test process exited with a non-zero status." }));
    if (countLine) {
        const [visiblePassed, visibleTotal, hiddenPassed, hiddenTotal] = countLine.slice("__EVALCUE_COUNTS__".length).split(",").map((value) => Math.max(0, Number(value) || 0));
        return { visiblePassed, visibleTotal, hiddenPassed, hiddenTotal, visibleFailures, protocolComplete: true };
    }
    return { ...defaults, visibleFailures, protocolComplete: false };
};

const normalizeStatus = (execution, counts) => {
    const allPassed = counts.visiblePassed === counts.visibleTotal && counts.hiddenPassed === counts.hiddenTotal;
    // A completed EvalCueAI test protocol can intentionally exit non-zero when
    // assertions fail. Treat that as a deterministic test failure, not a
    // candidate runtime crash.
    if (counts.protocolComplete) return allPassed ? "passed" : "failed";
    const description = String(execution?.status?.description || "");
    if (/time limit|timeout/i.test(description)) return "timeout";
    if (/compilation/i.test(description) || execution?.errorType === "compile" || execution?.compileOutput) return "compile_error";
    if (/runtime/i.test(description) || execution?.errorType === "runtime") return "runtime_error";
    return allPassed ? "passed" : "failed";
};

export const runDebuggingProject = async ({ files, runtime, includeHiddenTests = false }) => {
    const validated = validateDebuggingProject(files).files;
    const visibleTotal = validated.filter((file) => file.kind === "visible_test").length;
    const hiddenTotal = includeHiddenTests ? validated.filter((file) => file.kind === "hidden_test").length : 0;
    const archive = buildDebuggingArchive({ files: validated, runtime, includeHiddenTests });
    let execution;
    try {
        execution = await executeJudge0Submission({ language_id: MULTI_FILE_LANGUAGE_ID, additional_files: archive.toString("base64") }, { metricLanguage: `debugging-${runtime}` });
    } catch (error) {
        if (error?.statusCode === 504) return { status: "timeout", visiblePassed: 0, visibleTotal, hiddenPassed: 0, hiddenTotal, visibleFailures: [] };
        throw error;
    }
    const counts = countsFromOutput(execution.stdout, { visiblePassed: execution.isError ? 0 : visibleTotal, visibleTotal, hiddenPassed: execution.isError ? 0 : hiddenTotal, hiddenTotal });
    return {
        status: normalizeStatus(execution, counts),
        visiblePassed: counts.visiblePassed,
        visibleTotal: counts.visibleTotal,
        hiddenPassed: counts.hiddenPassed,
        hiddenTotal: counts.hiddenTotal,
        visibleFailures: counts.visibleFailures,
    };
};

export const DEBUGGING_MULTI_FILE_LANGUAGE_ID = MULTI_FILE_LANGUAGE_ID;
