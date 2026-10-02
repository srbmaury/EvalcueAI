// Build-time HTML for prerendered SEO routes (used by vite.config.js). index.html marks its default SEO tags
// with seo-head markers; each prerendered route replaces that block with its own tags. Missing markers fail
// the build instead of silently shipping another page's title, description or canonical URL.
export const SEO_HEAD_START = "<!-- seo-head:start -->";
export const SEO_HEAD_END = "<!-- seo-head:end -->";
const ROOT = '<div id="root"></div>';

export const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
})[character]);

const replaceOnce = (html, search, replacement, label) => {
    const index = html.indexOf(search);
    if (index < 0 || html.indexOf(search, index + search.length) >= 0) {
        throw new Error(`index.html must contain exactly one ${label}`);
    }
    return html.slice(0, index) + replacement + html.slice(index + search.length);
};

export const renderSeoHead = ({ title, description, canonicalUrl, ogType = "website", siteName, structuredData, imagePath = "/og-image.png" }) => {
    const text = (value) => escapeHtml(value);
    const imageUrl = new URL(imagePath, canonicalUrl).href;
    // "<" in JSON-LD would let page data close the script element.
    const jsonLd = JSON.stringify(structuredData).replace(/</g, "\\u003c");
    return [
        SEO_HEAD_START,
        `<title>${text(title)}</title>`,
        `<meta name="description" content="${text(description)}" />`,
        '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />',
        `<link rel="canonical" href="${text(canonicalUrl)}" />`,
        `<meta property="og:title" content="${text(title)}" />`,
        `<meta property="og:description" content="${text(description)}" />`,
        `<meta property="og:type" content="${text(ogType)}" />`,
        `<meta property="og:url" content="${text(canonicalUrl)}" />`,
        `<meta property="og:site_name" content="${text(siteName)}" />`,
        '<meta property="og:locale" content="en_US" />',
        `<meta property="og:image" content="${text(imageUrl)}" />`,
        '<meta property="og:image:width" content="1200" />',
        '<meta property="og:image:height" content="630" />',
        `<meta property="og:image:alt" content="${text(siteName)}: AI technical interviews for software engineers" />`,
        '<meta name="twitter:card" content="summary_large_image" />',
        `<meta name="twitter:title" content="${text(title)}" />`,
        `<meta name="twitter:description" content="${text(description)}" />`,
        `<meta name="twitter:image" content="${text(imageUrl)}" />`,
        `<script type="application/ld+json">${jsonLd}</script>`,
        SEO_HEAD_END,
    ].join("\n    ");
};

export const applyStaticSeoHtml = (baseHtml, { head, markup }) => {
    const start = baseHtml.indexOf(SEO_HEAD_START);
    const end = baseHtml.indexOf(SEO_HEAD_END);
    if (start < 0 || end < start || baseHtml.indexOf(SEO_HEAD_START, start + 1) >= 0) {
        throw new Error(`index.html must contain one ${SEO_HEAD_START} … ${SEO_HEAD_END} block`);
    }
    const withHead = baseHtml.slice(0, start) + head + baseHtml.slice(end + SEO_HEAD_END.length);
    return replaceOnce(withHead, ROOT, `<div id="root">${markup}</div>`, ROOT);
};
