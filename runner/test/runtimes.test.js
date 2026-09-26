import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RUNTIMES } from "../src/runtimes.js";

describe("runtime commands", () => {
    it("names java snippet files after the public class", () => {
        const { snippet } = RUNTIMES["java-21"];
        assert.equal(snippet.fileName("public final class Solution {}"), "Solution.java");
        assert.equal(snippet.fileName("class Helper {}"), "Main.java");
        assert.deepEqual(snippet.run("Solution.java").slice(-1), ["Solution"]);
    });

    it("runs java tests by package-qualified class name", () => {
        const test = { path: "src/test/java/app/CalcTest.java", content: "package app;\npublic class CalcTest {}" };
        assert.deepEqual(RUNTIMES["java-21"].project.testSteps(test).at(0).slice(-3), ["-cp", ".build", "app.CalcTest"]);
    });

    it("syntax-checks c++ sources once and links each test separately", () => {
        const files = [{ path: "lib.cpp", test: false }, { path: "lib.h", test: false }, { path: "t.cpp", test: true }];
        assert.deepEqual(RUNTIMES["cpp-20"].project.compile(files).slice(-2), ["-fsyntax-only", "lib.cpp"]);
        const [build, run] = RUNTIMES["cpp-20"].project.testSteps(files[2], files, 3);
        assert.deepEqual(build.slice(-4), ["lib.cpp", "t.cpp", "-o", ".build/test-3"]);
        assert.deepEqual(run, ["./.build/test-3"]);
    });
});
