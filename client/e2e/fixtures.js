import { expect, test as base } from "@playwright/test";

// Default public config so specs never depend on a locally running API. It mirrors the real
// /api/auth/public-config shape; a spec that registers its own route for this URL takes precedence,
// because Playwright checks the most recently registered route first.
export const DEFAULT_PUBLIC_CONFIG = {
    google: { enabled: true, clientId: "e2e-google-client.apps.googleusercontent.com" },
    captcha: { enabled: false, provider: "turnstile", loginEnabled: false, registerEnabled: false, candidateStartEnabled: false },
    features: { accountDataExport: false, codeExecution: true, transcription: true },
};

export const test = base.extend({
    page: async ({ page }, provide) => {
        await page.route("**/api/auth/public-config", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(DEFAULT_PUBLIC_CONFIG) }));
        await provide(page);
    },
});

export { expect };
