// Escapes plain text for safe insertion into a LaTeX document body. Every AI- or
// user-influenced string must go through this before being placed inside a template
// argument — it's what keeps arbitrary resume/JD text from being interpreted as LaTeX
// commands (a stray "\", "{", "#", etc. in someone's job description or resume text
// would otherwise corrupt or break the compile, or in principle inject markup).
const LATEX_SPECIAL_CHARS = {
    "\\": "\\textbackslash{}",
    "{": "\\{",
    "}": "\\}",
    "$": "\\$",
    "&": "\\&",
    "#": "\\#",
    "_": "\\_",
    "%": "\\%",
    "~": "\\textasciitilde{}",
    "^": "\\textasciicircum{}",
};

export const escapeLatex = (value) => (value === undefined || value === null ? "" : value.toString())
    .replace(/[\\{}$&#_%~^]/g, (char) => LATEX_SPECIAL_CHARS[char]);

// For \href{URL}{...} targets: the URL argument is a literal LaTeX brace-delimited
// argument too, so it can't contain raw "{", "}", or "\" any more safely than body text
// can — but percent-escaping or textbackslash substitution would corrupt the URL itself.
// Instead of escaping, reject anything that doesn't look like a plain https/mailto URL,
// and drop the link (falling back to plain text) rather than ever emit unsafe content
// inside a brace argument.
export const sanitizeLatexUrl = (value) => {
    const url = (value || "").toString().trim();
    if (!url) return "";
    if (/[\\{}%#]/.test(url)) return "";
    if (/^mailto:[^\s<>]+@[^\s<>]+\.[^\s<>]+$/i.test(url)) return url;
    if (/^https?:\/\/[^\s<>]+$/i.test(url)) return url;
    return "";
};
