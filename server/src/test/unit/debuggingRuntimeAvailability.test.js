import { afterEach, describe, expect, it } from "vitest";
import { enabledDebuggingRuntimeIds, supportedDebuggingRuntimes } from "../../services/debuggingRuntimeProfiles.js";

describe("debugging runtime availability", () => {
    const original = process.env.DEBUGGING_RUNTIMES;
    afterEach(() => { process.env.DEBUGGING_RUNTIMES = original; });

    it("offers every runtime when not configured", () => {
        delete process.env.DEBUGGING_RUNTIMES;
        expect(enabledDebuggingRuntimeIds()).toEqual(["node-22", "python-3", "java-21", "cpp-20"]);
    });

    it("restricts runtimes to the configured list and ignores unknown ids", () => {
        process.env.DEBUGGING_RUNTIMES = "python-3, ruby-3";
        expect(supportedDebuggingRuntimes()).toEqual([{ runtime: "python-3", label: "Python 3" }]);
    });
});
