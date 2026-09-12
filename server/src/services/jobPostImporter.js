import { requestPublicUrl, resolvePublicUrl } from "../utils/safeHttp.js";

const MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8_000;

const decodeHtml = (value = "") => value
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));

const htmlToText = (value = "") => decodeHtml(value)
    .replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/div>|<\/h\d>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

export const validatePublicJobUrl = async (rawUrl) => {
    let url;
    try { url = new URL(rawUrl); } catch { throw new Error("Enter a valid job-post URL."); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Only public HTTP(S) job-post URLs are allowed.");
    if ((url.protocol === "http:" && url.port && url.port !== "80") || (url.protocol === "https:" && url.port && url.port !== "443")) throw new Error("Custom URL ports are not allowed.");
    try {
        return (await resolvePublicUrl(url)).url;
    } catch (error) {
        if (/resolve/i.test(error?.message || "")) throw new Error("The job-post hostname could not be resolved.");
        throw new Error("Private network URLs are not allowed.");
    }
};

const metaContent = (html, key) => {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
        new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["']`, "i"),
        new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"),
    ];
    return decodeHtml(patterns.map((pattern) => html.match(pattern)?.[1]).find(Boolean) || "").trim();
};

const findJobPosting = (value) => {
    if (Array.isArray(value)) return value.map(findJobPosting).find(Boolean);
    if (!value || typeof value !== "object") return null;
    const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
    if (types.some((type) => String(type).toLowerCase() === "jobposting")) return value;
    return findJobPosting(value["@graph"]);
};

export const extractJobPost = (html, sourceUrl) => {
    let posting = null;
    for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
        try { posting = findJobPosting(JSON.parse(match[1])); } catch { /* Ignore malformed publisher metadata. */ }
        if (posting) break;
    }
    const pageTitle = decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim();
    const company = htmlToText(posting?.hiringOrganization?.name || metaContent(html, "og:site_name")).slice(0, 120);
    const jobRole = htmlToText(posting?.title || metaContent(html, "og:title") || pageTitle.split(/\s+[|–—-]\s+/)[0]).slice(0, 120);
    // Career sites can use a site-wide SEO description but job-specific sharing metadata.
    const descriptionSource = posting?.description || metaContent(html, "og:description") || metaContent(html, "description") || html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] || "";
    const jobDescription = htmlToText(descriptionSource).slice(0, 4_000);
    if (jobRole.length < 2 || jobDescription.length < 20) throw new Error("We couldn’t extract enough job details from this page. Enter them manually instead.");
    return { company, jobRole, jobDescription, sourceUrl, extractedAt: new Date().toISOString() };
};

export const importJobPost = async (rawUrl) => {
    // requestPublicUrl resolves the hostname once for each hop and pins the socket
    // to that validated address, closing the DNS-rebinding gap between validation
    // and connection. Redirect targets are independently resolved and validated.
    let response;
    try {
        response = await requestPublicUrl(rawUrl, {
            maxRedirects: MAX_REDIRECTS,
            timeoutMs: TIMEOUT_MS,
            maxBytes: MAX_BYTES,
            headers: { "user-agent": "Evalcue AI-JobImporter/1.0", accept: "text/html,text/plain;q=0.9" },
        });
    } catch (error) {
        const message = error?.message || "";
        if (/timed out/i.test(message)) throw new Error("The job post took too long to respond.");
        if (/too large/i.test(message)) throw new Error("The job post is too large to import.");
        if (/redirect/i.test(message)) throw new Error("The job post redirected too many times.");
        if (/private|public addresses|network/i.test(message)) throw new Error("Private network URLs are not allowed.");
        if (/resolve/i.test(message)) throw new Error("The job-post hostname could not be resolved.");
        throw new Error("The job post could not be reached.");
    }

    if (response.status < 200 || response.status >= 300) throw new Error(`The job post returned HTTP ${response.status}.`);
    const type = String(response.headers["content-type"] || "").toLowerCase();
    if (!type.includes("text/html") && !type.includes("text/plain")) throw new Error("The URL must return an HTML or text job post.");
    return extractJobPost(response.body.toString("utf8"), response.url.toString());
};
