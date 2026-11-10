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

    it("runs Java entry points by package-qualified class name", () => {
        const entry = { path: "src/app/Calc.java", content: "package app; public class Calc {}" };
        assert.deepEqual(RUNTIMES["java-21"].project.entryCommand(entry).slice(-3), ["-cp", ".build", "app.Calc"]);
    });

    it("links all C++ source files into the entry binary", () => {
        const runtime = RUNTIMES["cpp-20"].project;
        const files = [{ path: "lib.cpp" }, { path: "lib.h" }, { path: "main.cpp" }];
        assert.deepEqual(runtime.compile(files).slice(-4), ["./lib.cpp", "./main.cpp", "-o", ".build/main"]);
        assert.deepEqual(runtime.entryCommand(), ["./.build/main"]);
    });
});
