// Web search extracts often start with the page's navigation chrome and repeat the page title.
// Strip that so users (and question grounding) see the actual interview content.
const BOILERPLATE = [
    /skip to (?:main )?content/gi,
    /open (?:menu|navigation)/gi,
    /go to [\w.]+ home/gi,
    /\b(?:log ?in|sign ?in|sign ?up|get (?:the )?app|expand user menu|advertise on [\w.]+)\b/gi,
    /accept (?:all )?cookies?/gi,
];

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const cleanSourceSnippet = (content = "", title = "", maxLength = 700) => {
    let text = String(content || "").replace(/\s+/g, " ").trim();
    for (const pattern of BOILERPLATE) text = text.replace(pattern, " ");
    const cleanTitle = String(title || "").replace(/\s+/g, " ").trim();
    if (cleanTitle.length >= 12) text = text.replace(new RegExp(escapeRegExp(cleanTitle), "gi"), " ");
    return text.replace(/\s+/g, " ").replace(/^[\s:|·•-]+/, "").trim().slice(0, maxLength);
};
