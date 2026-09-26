// In-app browsers (social and messaging apps, Android WebViews) often block Google's sign-in popup.
const EMBEDDED_BROWSER_PATTERN = /FBAN|FBAV|Instagram|LinkedInApp|Line\/|Twitter|MicroMessenger|Snapchat|; wv\)/i;

export const isEmbeddedBrowser = (userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent) => (
    EMBEDDED_BROWSER_PATTERN.test(userAgent || "")
);
