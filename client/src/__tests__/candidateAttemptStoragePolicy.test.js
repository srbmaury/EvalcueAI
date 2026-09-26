import { afterEach, describe, expect, it, vi } from "vitest";
import { installCandidateAttemptStoragePolicy } from "../utils/candidateAttemptStoragePolicy.js";

describe("candidate attempt storage policy", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        window.localStorage.clear();
        window.sessionStorage.clear();
    });

    it("purges legacy persistent attempts and routes recovery to tab-scoped sessionStorage without a native prompt", () => {
        const candidateKey = "assessment-attempt:shared-token:open";
        window.localStorage.clear();
        window.sessionStorage.clear();
        window.localStorage.setItem(candidateKey, "legacy-persistent-attempt");
        window.localStorage.setItem("unrelated-setting", "keep-me");
        const confirm = vi.spyOn(window, "confirm");

        installCandidateAttemptStoragePolicy();

        expect(window.sessionStorage.getItem(candidateKey)).toBeNull();
        expect(window.localStorage.getItem(candidateKey)).toBeNull();
        expect(window.localStorage.getItem("unrelated-setting")).toBe("keep-me");

        window.localStorage.setItem(candidateKey, "tab-scoped-attempt");
        expect(window.sessionStorage.getItem(candidateKey)).toBe("tab-scoped-attempt");
        expect(window.localStorage.getItem(candidateKey)).toBe("tab-scoped-attempt");
        // Same-tab recovery is silent; the candidate page shows its own continue/start-over notice.
        expect(confirm).not.toHaveBeenCalled();
    });
});