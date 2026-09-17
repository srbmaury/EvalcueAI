import { escapeLatex, sanitizeLatexUrl } from "./latexEscape.js";

// The document skeleton (preamble, section styling, and the resumeItem/resumeSubheading/
// resumeProjectHeading/resumeTech macros) is fixed for every user and every generation —
// only the content below \begin{document} varies. This is deliberate: it's what makes the
// "fit in one page" retry loop meaningful (the AI is asked to shorten *content*, never
// touch layout), and it means no AI- or user-supplied text is ever interpreted as a LaTeX
// command — every value that reaches this file has already gone through escapeLatex/
// sanitizeLatexUrl, so at most it becomes inert, displayed text.
//
// Adapted from the reference template with one change: \input{glyphtounicode} and
// \pdfgentounicode=1 are pdfTeX-only ATS-text-extraction primitives and are undefined
// under Tectonic's XeTeX-based engine (compiling with them throws "Undefined control
// sequence"). Dropped rather than worked around — XeTeX already emits proper Unicode
// text in the PDF, which is what that pdfTeX trick exists to approximate in the first
// place, so nothing is lost by standardizing on the engine we actually compile with.
const PREAMBLE = String.raw`\documentclass[letterpaper,11pt]{article}

\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage[usenames,dvipsnames]{color}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{tabularx}
\usepackage[english]{babel}
\usepackage[T1]{fontenc}

\pagestyle{empty}

\addtolength{\oddsidemargin}{-0.55in}
\addtolength{\evensidemargin}{-0.55in}
\addtolength{\textwidth}{1.1in}
\addtolength{\topmargin}{-0.6in}
\addtolength{\textheight}{1.2in}

\urlstyle{same}
\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}

\titleformat{\section}{
  \vspace{-5pt}\scshape\raggedright\large\bfseries
}{}{0em}{}[\color{black}\titlerule \vspace{-5pt}]

\newcommand{\resumeItem}[1]{\item\small{#1 \vspace{-2pt}}}

\newcommand{\resumeSubheading}[4]{
  \vspace{-2pt}\item
    \begin{tabular*}{\textwidth}[t]{l@{\extracolsep{\fill}}r}
      \textbf{#1} & \textit{\small #2} \\
      \textit{\small #3} & \textit{\small #4} \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeProjectHeading}[2]{
    \item
    \begin{tabular*}{\textwidth}{l@{\extracolsep{\fill}}r}
      \small #1 & \small #2 \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeTech}[1]{\vspace{4pt}{\small\textit{\textbf{Tech:} #1}}\par\vspace{2pt}}

\renewcommand\labelitemii{$\vcenter{\hbox{\tiny$\bullet$}}$}
\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.0in, label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}[leftmargin=0.15in]}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-5pt}}
`;

const escapedOrEmpty = (value) => escapeLatex((value || "").toString().trim());

const hrefOrText = (label, url) => {
    const text = escapedOrEmpty(label);
    if (!text) return "";
    const safeUrl = sanitizeLatexUrl(url);
    return safeUrl ? `\\href{${safeUrl}}{${text}}` : text;
};

const buildContactLine = (contact = {}) => {
    const parts = [];
    if (contact.phone) parts.push(escapedOrEmpty(contact.phone));
    if (contact.email) parts.push(hrefOrText(contact.email, `mailto:${contact.email}`));
    if (contact.linkedin) parts.push(hrefOrText(contact.linkedinLabel || contact.linkedin, contact.linkedin));
    if (contact.github) parts.push(hrefOrText(contact.githubLabel || contact.github, contact.github));
    if (contact.website) parts.push(hrefOrText(contact.websiteLabel || contact.website, contact.website));
    return parts.filter(Boolean).join(" $|$\n    ");
};

const buildExperienceSection = (experience = []) => {
    const entries = experience.filter((item) => item?.title);
    if (!entries.length) return "";
    const body = entries.map((item) => {
        const bullets = (item.bullets || []).filter(Boolean).map((bullet) => `        \\resumeItem{${escapedOrEmpty(bullet)}}`).join("\n");
        const tech = item.tech ? `      \\resumeTech{${escapedOrEmpty(item.tech)}}\n` : "";
        return `    \\resumeSubheading
      {${escapedOrEmpty(item.title)}}{${escapedOrEmpty(item.dateRange)}}
      {${escapedOrEmpty(item.organization)}}{${escapedOrEmpty(item.location)}}
      \\resumeItemListStart
${bullets}
      \\resumeItemListEnd
${tech}`;
    }).join("\n");
    return `\\section{Experience}
  \\resumeSubHeadingListStart
${body}
  \\resumeSubHeadingListEnd
`;
};

const buildProjectsSection = (projects = []) => {
    const entries = projects.filter((item) => item?.name);
    if (!entries.length) return "";
    const body = entries.map((item) => {
        const links = (item.links || []).map((link) => hrefOrText(link?.label, link?.url)).filter(Boolean).join(" $|$ ");
        const bullets = (item.bullets || []).filter(Boolean).map((bullet) => `        \\resumeItem{${escapedOrEmpty(bullet)}}`).join("\n");
        const tech = item.tech ? `      \\resumeTech{${escapedOrEmpty(item.tech)}}\n` : "";
        return `    \\resumeProjectHeading
      {\\textbf{${escapedOrEmpty(item.name)}}}
      {${links}}
      \\resumeItemListStart
${bullets}
      \\resumeItemListEnd
${tech}`;
    }).join("\n");
    return `\\section{Projects}
  \\resumeSubHeadingListStart
${body}
  \\resumeSubHeadingListEnd
`;
};

const buildEducationSection = (education = []) => {
    const entries = education.filter((item) => item?.institution);
    if (!entries.length) return "";
    const body = entries.map((item) => `    \\resumeSubheading
      {${escapedOrEmpty(item.institution)}}{${escapedOrEmpty(item.dateRange)}}
      {${escapedOrEmpty(item.detail)}}{}`).join("\n");
    return `\\section{Education}
  \\resumeSubHeadingListStart
${body}
  \\resumeSubHeadingListEnd
`;
};

const buildSkillsSection = (skills = []) => {
    const entries = skills.filter((item) => item?.category && item?.items);
    if (!entries.length) return "";
    const lines = entries.map((item) => `     \\textbf{${escapedOrEmpty(item.category)}:} ${escapedOrEmpty(item.items)} \\\\`).join("\n");
    return `\\section{Skills}
 \\begin{itemize}[leftmargin=0in, label={}]
    \\small{\\item{
${lines}
    }}
 \\end{itemize}
 \\vspace{-12pt}
`;
};

const buildAchievementsSection = (achievements = []) => {
    const entries = achievements.filter(Boolean);
    if (!entries.length) return "";
    return `\\section{Achievements}
  \\resumeItemListStart
    \\resumeItem{${entries.map(escapedOrEmpty).join(" $\\cdot$ ")}}
  \\resumeItemListEnd
`;
};

/**
 * Builds a complete, compilable .tex document from structured content. The layout
 * (preamble + macros above) never changes; only these text fields do, and every one
 * of them is escaped before insertion — see escapeLatex/sanitizeLatexUrl.
 */
export const buildResumeLatex = (content = {}) => {
    const name = escapedOrEmpty(content.name) || "Candidate";
    const contactLine = buildContactLine(content.contact);
    const summary = escapedOrEmpty(content.summary);

    const sections = [
        buildExperienceSection(content.experience),
        buildProjectsSection(content.projects),
        buildEducationSection(content.education),
        buildSkillsSection(content.skills),
        buildAchievementsSection(content.achievements),
    ].filter(Boolean).join("\n");

    return `${PREAMBLE}
\\begin{document}

\\begin{center}
    \\textbf{\\Huge \\scshape ${name}} \\\\ \\vspace{3pt}
    \\small ${contactLine}
\\end{center}

${summary ? `\\vspace{-4pt}\n\\small{${summary}}\n` : ""}
${sections}
\\end{document}
`;
};
