const CANDIDATE_ATTEMPT_PREFIX = "assessment-attempt:";

let installed = false;

export const installCandidateAttemptStoragePolicy = () => {
    if (installed || typeof window === "undefined" || !window.Storage?.prototype) return;

    const prototype = window.Storage.prototype;
    const originalGetItem = prototype.getItem;
    const originalSetItem = prototype.setItem;
    const originalRemoveItem = prototype.removeItem;
    const originalKey = prototype.key;

    // Candidate attempt credentials used to be persisted in localStorage. Purge
    // those legacy browser entries instead of exposing them to a later user of
    // the same browser profile.
    try {
        for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
            const key = originalKey.call(window.localStorage, index);
            if (String(key || "").startsWith(CANDIDATE_ATTEMPT_PREFIX)) {
                originalRemoveItem.call(window.localStorage, key);
            }
        }
    } catch { /* browser storage is best effort */ }

    prototype.getItem = function getItem(key) {
        if (this === window.localStorage && String(key).startsWith(CANDIDATE_ATTEMPT_PREFIX)) {
            return originalGetItem.call(window.sessionStorage, key);
        }
        return originalGetItem.call(this, key);
    };

    prototype.setItem = function setItem(key, value) {
        if (this === window.localStorage && String(key).startsWith(CANDIDATE_ATTEMPT_PREFIX)) {
            return originalSetItem.call(window.sessionStorage, key, value);
        }
        return originalSetItem.call(this, key, value);
    };

    prototype.removeItem = function removeItem(key) {
        if (this === window.localStorage && String(key).startsWith(CANDIDATE_ATTEMPT_PREFIX)) {
            return originalRemoveItem.call(window.sessionStorage, key);
        }
        return originalRemoveItem.call(this, key);
    };

    installed = true;
};

export default installCandidateAttemptStoragePolicy;
