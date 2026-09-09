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
            const saved = originalGetItem.call(window.sessionStorage, normalizedKey);
            if (!saved) return null;
            const approvalKey = `${APPROVAL_PREFIX}${normalizedKey}`;
            if (originalGetItem.call(window.sessionStorage, approvalKey) === "yes") return saved;

            let approved = false;
            try {
                approved = window.confirm("This tab contains a saved assessment attempt. Continue only if this is your own attempt. Otherwise choose Cancel to clear it.");
            } catch { approved = false; }
            if (!approved) {
                originalRemoveItem.call(window.sessionStorage, normalizedKey);
                originalRemoveItem.call(window.sessionStorage, approvalKey);
                return null;
            }
            originalSetItem.call(window.sessionStorage, approvalKey, "yes");
            return saved;
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
