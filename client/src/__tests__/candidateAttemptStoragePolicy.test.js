import { describe, expect, it } from "vitest";
import { installCandidateAttemptStoragePolicy } from "../utils/candidateAttemptStoragePolicy.js";

describe("candidate attempt storage policy", () => {
    it("purges legacy persistent attempts and routes future attempt recovery to sessionStorage", () => {
        const candidateKey = "assessment-attempt:shared-token:open";
        window.localStorage.clear();
        window.sessionStorage.clear();
        window.localStorage.setItem(candidateKey, "legacy-persistent-attempt");
        window.localStorage.setItem("unrelated-setting", "keep-me");

        installCandidateAttemptStoragePolicy();

        expect(window.sessionStorage.getItem(candidateKey)).toBeNull();
        expect(window.localStorage.getItem(candidateKey)).toBeNull();
        expect(window.localStorage.getItem("unrelated-setting")).toBe("keep-me");

        window.localStorage.setItem(candidateKey, "tab-scoped-attempt");
        expect(window.sessionStorage.getItem(candidateKey)).toBe("tab-scoped-attempt");
        expect(window.localStorage.getItem(candidateKey)).toBe("tab-scoped-attempt");
    });
});
