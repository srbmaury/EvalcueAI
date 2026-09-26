import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { availableRuntimeIds, resetRuntimeCache, runSnippet } from "../../services/codeRunner.js";

const reply = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

describe("code runner client", () => {
    beforeEach(() => {
        process.env.CODE_RUNNER_URL = "https://runner.example";
        process.env.CODE_RUNNER_TOKEN = "t".repeat(40);
        resetRuntimeCache();
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        delete process.env.CODE_RUNNER_URL;
        delete process.env.CODE_RUNNER_TOKEN;
    });

    it("maps editor languages to runtimes and authenticates", async () => {
        const fetchMock = vi.fn(() => reply({ status: "ok", stdout: "42\n", stderr: "", compileOutput: "", durationMs: 120 }));
        vi.stubGlobal("fetch", fetchMock);
        const result = await runSnippet({ language: "java", code: "class Main {}", stdin: "21" });
        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toBe("https://runner.example/v1/snippets");
        expect(init.headers.authorization).toBe(`Bearer ${"t".repeat(40)}`);
        expect(JSON.parse(init.body)).toEqual({ runtime: "java-21", source: "class Main {}", stdin: "21" });
        expect(result).toMatchObject({ output: "42\n", isError: false, errorType: "none", time: 0.12 });
    });

    it("shapes compile errors, runtime errors and timeouts for the editor", async () => {
        vi.stubGlobal("fetch", vi.fn()
            .mockReturnValueOnce(reply({ status: "compile_error", compileOutput: "Main.java:1: error", stdout: "", stderr: "", durationMs: 1 }))
            .mockReturnValueOnce(reply({ status: "runtime_error", stdout: "", stderr: "Traceback", compileOutput: "", durationMs: 1 }))
            .mockReturnValueOnce(reply({ status: "timeout", stdout: "partial", stderr: "", compileOutput: "", durationMs: 6000 })));
        expect(await runSnippet({ language: "java", code: "x" })).toMatchObject({ isError: true, errorType: "compile", output: "Main.java:1: error" });
        expect(await runSnippet({ language: "python", code: "x" })).toMatchObject({ isError: true, errorType: "runtime", output: "Traceback" });
        expect(await runSnippet({ language: "javascript", code: "x" })).toMatchObject({ errorType: "timeout", output: "partial\nTime limit exceeded." });
    });

    it("reports an unconfigured or unreachable runner as unavailable", async () => {
        delete process.env.CODE_RUNNER_URL;
        await expect(runSnippet({ language: "python", code: "print(1)" })).rejects.toMatchObject({ statusCode: 503 });
        process.env.CODE_RUNNER_URL = "https://runner.example";
        vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("fetch failed"))));
        await expect(runSnippet({ language: "python", code: "print(1)" })).rejects.toMatchObject({ statusCode: 503, message: "Code runner is unreachable" });
        expect(await availableRuntimeIds()).toEqual([]);
    });

    it("caches the runner's probed runtimes and ignores unknown ids", async () => {
        const fetchMock = vi.fn(() => reply({ runtimes: [{ id: "python-3" }, { id: "cpp-20" }, { id: "ruby-3" }] }));
        vi.stubGlobal("fetch", fetchMock);
        expect(await availableRuntimeIds()).toEqual(["python-3", "cpp-20"]);
        expect(await availableRuntimeIds()).toEqual(["python-3", "cpp-20"]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
