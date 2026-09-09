import { requestPublicUrl, resolvePublicUrl } from "../utils/safeHttp.js";

const MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8_000;
const MAX_DESCRIPTION_CHARS = 4_000;

const decodeHtml = (value = "") => String(value || "")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));

const htmlToText = (value = "") => decodeHtml(value)
    .replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/div>|<\/section>|<\/h\d>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

const cleanText = (value, max = 12_000) => htmlToText(value).replace(/\u0000/g, "").trim().slice(0, max);
const compact = (value, max = 120) => cleanText(value, max).replace(/\s+/g, " ").trim().slice(0, max);

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

const findObjects = (value, predicate, results = [], depth = 0) => {
    if (depth > 10 || results.length >= 20 || value == null) return results;
    if (Array.isArray(value)) {
        for (const item of value) findObjects(item, predicate, results, depth + 1);
        return results;
    }
    if (typeof value !== "object") return results;
    if (predicate(value)) results.push(value);
    for (const child of Object.values(value)) findObjects(child, predicate, results, depth + 1);
    return results;
};

const isJobPosting = (value) => {
    const types = Array.isArray(value?.["@type"]) ? value["@type"] : [value?.["@type"]];
    return types.some((type) => String(type || "").toLowerCase() === "jobposting");
};

const parseJsonScripts = (html) => {
    const values = [];
    for (const match of html.matchAll(/<script[^>]*(?:type=["']application\/(?:ld\+)?json["']|id=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/gi)) {
        try { values.push(JSON.parse(match[1])); } catch { /* publisher-controlled JSON can be malformed */ }
    }
    return values;
};

const firstEmbeddedJobObject = (jsonValues) => {
    for (const value of jsonValues) {
        const exact = findObjects(value, isJobPosting)[0];
        if (exact) return exact;
    }
    for (const value of jsonValues) {
        const candidate = findObjects(value, (item) => {
            const keys = Object.keys(item || {}).map((key) => key.toLowerCase());
            const hasTitle = keys.some((key) => ["title", "jobtitle", "positiontitle", "job_title"].includes(key));
            const hasDescription = keys.some((key) => ["description", "jobdescription", "job_description", "responsibilities", "qualifications"].includes(key));
            return hasTitle && hasDescription;
        })[0];
        if (candidate) return candidate;
    }
    return null;
};

const valueFrom = (object, keys) => {
    for (const key of keys) {
        const value = object?.[key];
        if (value != null && value !== "") return value;
    }
    return "";
};

const stringList = (value) => {
    if (Array.isArray(value)) return value.flatMap(stringList);
    if (value && typeof value === "object") return Object.values(value).flatMap(stringList);
    const text = cleanText(value, 4_000);
    return text ? [text] : [];
};

const locationText = (posting) => {
    const locations = Array.isArray(posting?.jobLocation) ? posting.jobLocation : posting?.jobLocation ? [posting.jobLocation] : [];
    const pieces = [];
    for (const location of locations) {
        const address = location?.address || location;
        if (typeof address === "string") pieces.push(address);
        else if (address && typeof address === "object") {
            pieces.push([address.streetAddress, address.addressLocality, address.addressRegion, address.postalCode, address.addressCountry?.name || address.addressCountry].filter(Boolean).join(", "));
        }
    }
    if (posting?.jobLocationType) pieces.push(String(posting.jobLocationType));
    return [...new Set(pieces.map((item) => compact(item, 300)).filter(Boolean))].join("; ");
};

const salaryText = (posting) => {
    const salary = posting?.baseSalary;
    if (!salary) return "";
    const currency = salary.currency || salary?.value?.currency || "";
    const value = salary.value || salary;
    if (typeof value === "number" || typeof value === "string") return `${currency} ${value}`.trim();
    if (value && typeof value === "object") {
        const range = [value.minValue, value.maxValue].filter((item) => item != null).join(" - ");
        return [currency, range, value.unitText].filter(Boolean).join(" ");
    }
    return "";
};

const semanticSections = (html) => {
    const sections = [];
    const patterns = [
        /<main\b[^>]*>([\s\S]*?)<\/main>/gi,
        /<(?:section|div|article)\b[^>]*(?:id|class)=["'][^"']*(?:job[-_ ]?(?:description|details|content)|description|responsibilit|qualification|requirement|skills|about[-_ ]?(?:the[-_ ]?)?role|what[-_ ]?you|position)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi,
    ];
    for (const pattern of patterns) {
        for (const match of html.matchAll(pattern)) {
            const text = cleanText(match[2] || match[1], 15_000);
            if (text.length >= 80) sections.push(text);
            if (sections.length >= 12) return sections;
        }
    }
    return sections;
};

const cleanedBody = (html) => {
    const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html;
    return cleanText(body
        .replace(/<(?:header|nav|footer|aside)\b[^>]*>[\s\S]*?<\/(?:header|nav|footer|aside)>/gi, " ")
        .replace(/<(?:script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/(?:script|style|noscript|svg)>/gi, " "), 18_000);
};

const normalizeForDedup = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const looksJobRich = (text) => /responsibilit|qualification|requirement|experience|skills?|you will|what you('|’)ll do|about the role|preferred|minimum|years?/i.test(text);

const buildDescription = ({ posting, embedded, html }) => {
    const candidates = [];
    const add = (label, value, weight) => {
        const minLength = ["Job details", "Page content", "Page description"].includes(label) ? 20 : 3;
        for (const raw of stringList(value)) {
            const text = cleanText(raw, 12_000);
            if (text.length >= minLength) candidates.push({ label, text, weight: weight + Math.min(text.length / 1000, 4) + (looksJobRich(text) ? 2 : 0) });
        }
    };

    add("Description", posting?.description || valueFrom(embedded, ["description", "jobDescription", "job_description"]), 10);
    add("Responsibilities", posting?.responsibilities || valueFrom(embedded, ["responsibilities", "responsibility", "duties"]), 9);
    add("Qualifications", posting?.qualifications || valueFrom(embedded, ["qualifications", "requirements", "minimumQualifications", "preferredQualifications"]), 9);
    add("Skills", posting?.skills || valueFrom(embedded, ["skills", "skillRequirements"]), 8);
    add("Experience", posting?.experienceRequirements || valueFrom(embedded, ["experienceRequirements", "experience", "experience_required"]), 8);
    add("Education", posting?.educationRequirements || valueFrom(embedded, ["educationRequirements", "education"]), 7);

    for (const section of semanticSections(html)) add("Job details", section, 7);
    add("Page content", cleanedBody(html), 2);
    add("Page description", metaContent(html, "og:description"), 1);
    add("Page description", metaContent(html, "description"), 0);

    candidates.sort((a, b) => b.weight - a.weight);
    const selected = [];
    const seen = [];
    let total = 0;
    for (const candidate of candidates) {
        const normalized = normalizeForDedup(candidate.text);
        if (!normalized || seen.some((prior) => prior === normalized || prior.includes(normalized) || normalized.includes(prior))) continue;
        seen.push(normalized);
        const prefix = candidate.label && !/^Description$/.test(candidate.label) ? `${candidate.label}:\n` : "";
        const remaining = MAX_DESCRIPTION_CHARS - total;
        if (remaining <= 0) break;
        const chunk = `${prefix}${candidate.text}`.slice(0, remaining);
        if (chunk.length < 20) continue;
        selected.push(chunk);
        total += chunk.length + 2;
    }
    return selected.join("\n\n").slice(0, MAX_DESCRIPTION_CHARS).trim();
};

export const extractJobPost = (html, sourceUrl) => {
    const jsonValues = parseJsonScripts(html);
    const posting = jsonValues.flatMap((value) => findObjects(value, isJobPosting))[0] || null;
    const embedded = posting || firstEmbeddedJobObject(jsonValues) || {};
    const pageTitle = decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim();
    const company = compact(
        posting?.hiringOrganization?.name
        || valueFrom(embedded, ["company", "companyName", "organization", "hiringOrganization"] )?.name
        || valueFrom(embedded, ["company", "companyName", "organization"])
        || metaContent(html, "og:site_name"),
        120,
    );
    const jobRole = compact(
        posting?.title
        || valueFrom(embedded, ["title", "jobTitle", "job_title", "positionTitle"])
        || metaContent(html, "og:title")
        || pageTitle.split(/\s+[|–—-]\s+/)[0],
        120,
    );
    const jobDescription = buildDescription({ posting, embedded, html });
    if (jobRole.length < 2 || jobDescription.length < 20) throw new Error("We couldn’t extract enough job details from this page. Enter them manually instead.");

    const location = compact(locationText(posting) || valueFrom(embedded, ["location", "jobLocation", "workplace"]), 300);
    const employmentType = compact(posting?.employmentType || valueFrom(embedded, ["employmentType", "employment_type", "jobType"]), 120);
    const salary = compact(salaryText(posting) || valueFrom(embedded, ["salary", "compensation", "baseSalary"]), 200);
    const hasStructuredDepth = Boolean(posting?.responsibilities || posting?.qualifications || posting?.skills || posting?.experienceRequirements || posting?.educationRequirements);
    const extractionQuality = jobDescription.length >= 1200
        ? "high"
        : jobDescription.length >= 500 || (hasStructuredDepth && jobDescription.length >= 180)
            ? "medium"
            : "low";

    return {
        company,
        jobRole,
        jobDescription,
        location,
        employmentType,
        salary,
        extractionQuality,
        sourceUrl,
        extractedAt: new Date().toISOString(),
    };
};

export const importJobPost = async (rawUrl) => {
    let response;
    try {
        response = await requestPublicUrl(rawUrl, {
            maxRedirects: MAX_REDIRECTS,
            timeoutMs: TIMEOUT_MS,
            maxBytes: MAX_BYTES,
            headers: { "user-agent": "Evalcue AI-JobImporter/2.0", accept: "text/html,text/plain;q=0.9" },
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
