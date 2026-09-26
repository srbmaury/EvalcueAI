const CANDIDATE_ATTEMPT_PREFIX = "assessment-attempt:";
const APPROVAL_PREFIX = "assessment-attempt-approved:";

let installed = false;

export const installCandidateAttemptStoragePolicy = () => {
    if (installed || typeof window === "undefined" || !window.Storage?.prototype) return;

    const prototype = window.Storage.prototype;
    const originalGetItem = prototype.getItem;
    const originalSetItem = prototype.setItem;
    const originalRemoveItem = prototype.removeItem;
    const originalKey = prototype.key;

    try {
        for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
            const key = originalKey.call(window.localStorage, index);
            if (String(key || "").startsWith(CANDIDATE_ATTEMPT_PREFIX)) originalRemoveItem.call(window.localStorage, key);
        }
    } catch { /* browser storage is best effort */ }

    prototype.getItem = function getItem(key) {
        const normalizedKey = String(key || "");
        if (this === window.localStorage && normalizedKey.startsWith(CANDIDATE_ATTEMPT_PREFIX)) {
            // Attempts are tab-scoped (sessionStorage), so a refresh in the same tab resumes silently. The
            // candidate page shows its own "continue or start over" notice for the shared-device case;
            // a native confirm() here duplicated it and a single Cancel wiped the attempt.
            return originalGetItem.call(window.sessionStorage, normalizedKey);
        }
        return originalGetItem.call(this, key);
    };

    prototype.setItem = function setItem(key, value) {
        const normalizedKey = String(key || "");
        if (this === window.localStorage && normalizedKey.startsWith(CANDIDATE_ATTEMPT_PREFIX)) {
            return originalSetItem.call(window.sessionStorage, normalizedKey, value);
        }
        return originalSetItem.call(this, key, value);
    };

    prototype.removeItem = function removeItem(key) {
        const normalizedKey = String(key || "");
        if (this === window.localStorage && normalizedKey.startsWith(CANDIDATE_ATTEMPT_PREFIX)) {
            originalRemoveItem.call(window.sessionStorage, `${APPROVAL_PREFIX}${normalizedKey}`);
            return originalRemoveItem.call(window.sessionStorage, normalizedKey);
        }
        return originalRemoveItem.call(this, key);
    };

    installed = true;
};

export default installCandidateAttemptStoragePolicy;
