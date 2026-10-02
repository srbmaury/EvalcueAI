// Build-time feature flags. The app reads them from import.meta.env; vite.config.js reads the same keys from
// process.env (filled by buildEnv.js) when it prerenders public pages, the sitemap and llms.txt.
const readFlag = (key) => {
    const value = import.meta.env?.[key] ?? globalThis.process?.env?.[key];
    return String(value ?? "").trim().toLowerCase() === "true";
};

// Debugging assignments need the code runner. Until it is deployed, public copy must not promise them.
// The server's ENABLE_DEBUGGING_ASSESSMENTS still decides whether the builder and API accept the round type.
export const DEBUGGING_ASSESSMENTS_ENABLED = readFlag("VITE_ENABLE_DEBUGGING_ASSESSMENTS");

export const debuggingCopy = (enabled, disabled = "") => DEBUGGING_ASSESSMENTS_ENABLED ? enabled : disabled;
export const debuggingItems = (...items) => DEBUGGING_ASSESSMENTS_ENABLED ? items : [];
