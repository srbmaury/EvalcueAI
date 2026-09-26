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

    it("truncates output floods", async () => {
        const flood = await snippet("python-3", "import sys\nsys.stdout.write('x' * 10_000_000)");
        assert.equal(flood.truncated, true);
        assert.ok(flood.stdout.length <= 64 * 1024);
    });
});

const project = async (runtime, files, tests) => (await post("/v1/projects", { runtime, files, tests })).body;

describe("runner projects", live, () => {
    it("runs node tests against candidate sources", async () => {
        const files = [
            { path: "src/sum.js", content: "export const sum = (a, b) => a - b;\n" },
            { path: "package.json", content: "{\"type\":\"module\"}" },
            { path: "test/sum.test.js", content: "import test from 'node:test'; import assert from 'node:assert'; import { sum } from '../src/sum.js';\ntest('adds', () => assert.equal(sum(2, 3), 5));\n" },
            { path: "test/zero.test.js", content: "import test from 'node:test'; import assert from 'node:assert'; import { sum } from '../src/sum.js';\ntest('zero', () => assert.equal(sum(0, 0), 0));\n" },
        ];
        const result = await project("node-22", files, [{ path: "test/sum.test.js", name: "adds" }, { path: "test/zero.test.js", name: "zero" }]);
        assert.equal(result.status, "completed");
        assert.deepEqual(result.tests.map((test) => [test.name, test.passed]), [["adds", false], ["zero", true]]);
    });

    it("compiles java packages once and runs each test class", async () => {
        const files = [
            { path: "src/main/java/app/Calc.java", content: "package app; public class Calc { public static int twice(int x) { return x * 2; } }" },
            { path: "src/test/java/app/CalcTest.java", content: "package app; public class CalcTest { public static void main(String[] a) { if (Calc.twice(3) != 6) System.exit(1); } }" },
        ];
        const result = await project("java-21", files, [{ path: "src/test/java/app/CalcTest.java", name: "twice" }]);
        assert.equal(result.tests[0].passed, true, JSON.stringify(result));
        const broken = await project("java-21", [{ ...files[0], content: "package app; public class Calc {" }, files[1]], [{ path: files[1].path, name: "twice" }]);
        assert.equal(broken.status, "compile_error");
    });

    it("links each c++ test against the sources", async () => {
        const files = [
            { path: "math.h", content: "int twice(int);\n" },
            { path: "math.cpp", content: "#include \"math.h\"\nint twice(int x) { return x + x; }\n" },
            { path: "tests/twice.cpp", content: "#include \"../math.h\"\nint main() { return twice(4) == 8 ? 0 : 1; }\n" },
        ];
        const result = await project("cpp-20", files, [{ path: "tests/twice.cpp", name: "twice" }]);
        assert.equal(result.tests[0].passed, true, JSON.stringify(result));
    });

    it("runs python test files", async () => {
        const files = [
            { path: "app.py", content: "def slug(s):\n    return s.lower()\n" },
            { path: "test_app.py", content: "from app import slug\nassert slug('A B') == 'a-b'\n" },
        ];
        const result = await project("python-3", files, [{ path: "test_app.py", name: "slug" }]);
        assert.equal(result.tests[0].passed, false);
        assert.match(result.tests[0].output, /AssertionError/);
    });

    it("rejects path traversal", async () => {
        const response = await post("/v1/projects", { runtime: "python-3", files: [{ path: "../escape.py", content: "" }], tests: [{ path: "../escape.py" }] });
        assert.equal(response.status, 400);
    });
});
