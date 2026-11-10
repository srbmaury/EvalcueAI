// Runs against a live runner container: RUNNER_URL=http://127.0.0.1:8080 RUNNER_TOKEN=... npm test
// Skipped when those variables are not set (unit tests still run).
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const url = process.env.RUNNER_URL;
const token = process.env.RUNNER_TOKEN;
const live = { skip: !url || !token ? "RUNNER_URL and RUNNER_TOKEN not set" : false };

const post = async (path, body) => {
    const response = await fetch(`${url}${path}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
};
const snippet = async (runtime, source, stdin = "") => (await post("/v1/snippets", { runtime, source, stdin })).body;

describe("runner snippets", live, () => {
    it("runs every runtime with stdin", async () => {
        assert.equal((await snippet("node-22", "process.stdin.on('data', d => console.log(String(d).trim().toUpperCase()))", "hi")).stdout.trim(), "HI");
        assert.equal((await snippet("python-3", "print(input()[::-1])", "abc")).stdout.trim(), "cba");
        assert.equal((await snippet("java-21", "import java.util.*;\npublic class Solution { public static void main(String[] a) { System.out.println(new Scanner(System.in).nextInt() * 2); } }", "21")).stdout.trim(), "42");
        assert.equal((await snippet("cpp-20", "#include <iostream>\n#include <ranges>\nint main(){int s=0; for(int i: std::views::iota(1,5)) s+=i; std::cout<<s;}")).stdout.trim(), "10");
    });

    it("reports compile and runtime errors separately", async () => {
        const compile = await snippet("java-21", "public class Main { void x( }");
        assert.equal(compile.status, "compile_error");
        assert.match(compile.compileOutput, /error/);
        const runtime = await snippet("python-3", "raise ValueError('boom')");
        assert.equal(runtime.status, "runtime_error");
        assert.match(runtime.stderr, /ValueError: boom/);
    });

    it("stops infinite loops, memory bombs and fork bombs", async () => {
        assert.equal((await snippet("node-22", "while (true) {}")).status, "timeout");
        assert.notEqual((await snippet("python-3", "x = []\nwhile True: x.append(bytearray(10**7))")).status, "ok");
        const fork = await snippet("python-3", "import os\nfor _ in range(1000):\n    os.fork()\nprint('forked')");
        assert.notEqual(fork.status, "ok");
    });

    it("has no network and cannot see the host filesystem", async () => {
        const network = await snippet("python-3", "import socket\nsocket.create_connection(('1.1.1.1', 80), timeout=3)");
        assert.equal(network.status, "runtime_error");
        const fs = await snippet("python-3", "import os\nprint(sorted(os.listdir('/')))\nprint(os.path.exists('/app/src/server.js'), os.path.exists('/etc/passwd'), os.getuid())");
        assert.match(fs.stdout, /False False 65534/);
        const write = await snippet("python-3", "open('/usr/evil', 'w')");
        assert.equal(write.status, "runtime_error");
    });

    it("filters dangerous syscalls but keeps threads working", async () => {
        const unshare = await snippet("python-3", "import os\nos.unshare(os.CLONE_NEWUSER)");
        assert.equal(unshare.status, "runtime_error");
        assert.match(unshare.stderr, /PermissionError|Operation not permitted/);
        const threads = await snippet("python-3", "import threading\nout = []\nts = [threading.Thread(target=out.append, args=(i,)) for i in range(8)]\n[t.start() for t in ts]\n[t.join() for t in ts]\nprint(sorted(out))");
        assert.equal(threads.stdout.trim(), "[0, 1, 2, 3, 4, 5, 6, 7]");
        const workers = await snippet("node-22", "const { Worker } = require('node:worker_threads'); new Worker('require(\"node:worker_threads\").parentPort.postMessage(21)', { eval: true }).on('message', (n) => console.log(n * 2));");
        assert.equal(workers.stdout.trim(), "42");
    });

    it("truncates output floods", async () => {
        const flood = await snippet("python-3", "import sys\nsys.stdout.write('x' * 10_000_000)");
        assert.equal(flood.truncated, true);
        assert.ok(flood.stdout.length <= 64 * 1024);
    });
});

const project = async (runtime, files, entryFile, stdout) =>
    (await post("/v1/projects", { runtime, files, entryFile, tests: [{ stdin: "", stdout, name: "result" }] })).body;

describe("runner projects", live, () => {
    for (const [runtime, path, content] of [
        ["node-22", "main.js", "console.log(5)"],
        ["python-3", "main.py", "print(5)"],
        ["java-21", "app/Main.java", "package app; public class Main { public static void main(String[] args) { System.out.println(5); } }"],
        ["cpp-20", "main.cpp", "#include <iostream>\nint main() { std::cout << 5; }"],
    ]) {
        it(`grades trusted output for ${runtime}`, async () => {
            const result = await project(runtime, [{ path, content }], path, "5");
            assert.equal(result.tests[0].passed, true, JSON.stringify(result));
        });
    }

    it("rejects a successful early exit without the expected output", async () => {
        const result = await project("python-3", [{ path: "main.py", content: "import os; os._exit(0)" }], "main.py", "5");
        assert.equal(result.tests[0].passed, false, JSON.stringify(result));
    });

    it("rejects path traversal", async () => {
        const response = await post("/v1/projects", { runtime: "python-3", files: [{ path: "../escape.py", content: "" }], tests: [{ path: "../escape.py" }] });
        assert.equal(response.status, 400);
    });
});
