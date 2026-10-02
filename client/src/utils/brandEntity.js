// Single source of truth for how EvalcueAI describes itself to search engines and AI assistants.
// Imported by the Vite prerender (vite.config.js), the runtime SEO component, and /llms.txt, so the
// name, positioning, official URLs, and plan facts stay identical everywhere they are published.

import { debuggingCopy, debuggingItems } from "./featureFlags.js";

export const BRAND_NAME = "EvalcueAI";
export const BUSINESS_LEGAL_NAME = "SAURABH MAURYA";
export const BRAND_TAGLINE = "AI interview practice and structured technical hiring for software engineers";
export const BRAND_POSITIONING = `Coding, system design, ${debuggingCopy("debugging, ")}and technical interviews with adaptive AI follow-ups and structured engineering assessments.`;
export const HOME_TITLE = `EvalcueAI | AI Coding, System Design & ${debuggingCopy("Debugging", "Technical")} Interviews for Engineers`;
export const HOME_DESCRIPTION = `EvalcueAI is AI interview practice and structured technical hiring for software engineers: coding, system design, ${debuggingCopy("debugging, ")}and technical interviews with adaptive AI follow-ups.`;
export const BRAND_DESCRIPTION = `${BRAND_NAME} is a browser-based platform for software engineering interviews. Engineers practice coding, system-design, ${debuggingCopy("debugging, ")}and technical-discussion rounds with an AI interviewer that asks adaptive follow-ups based on their answers. Hiring teams build structured engineering assessments and review evidence-based scorecards, with every hiring decision made by a human reviewer.`;

export const BRAND_URLS = Object.freeze({
    landing: "https://evalcueai.com",
    practice: "https://practice.evalcueai.com",
    hiring: "https://hiring.evalcueai.com",
    docs: "https://evalcueai.com/docs",
    about: "https://evalcueai.com/about",
    methodology: "https://evalcueai.com/ai-interview-evaluation-methodology",
    source: "https://github.com/srbmaury/EvalcueAI",
});

// Independent profiles that describe the product. Add Product Hunt, G2, LinkedIn, etc. as they go live.
export const BRAND_SAME_AS = Object.freeze([BRAND_URLS.source]);

// Server defaults from server/src/services/practiceEntitlements.js. The Pro price comes from the PayU catalog at
// runtime, so public pages state the included limits and link to pricing instead of a fixed amount.
export const PRACTICE_PLANS = Object.freeze([
    { name: "Free", summary: "3 AI practice interviews, 10 resume reviews, and 10 tailored resume generations each month. No card required." },
    { name: "Pro", summary: "100 AI practice interviews, 100 resume reviews, and 100 tailored resume generations each month for active preparation." },
]);
export const HIRING_PLAN_SUMMARY = "Hiring teams can start with a pilot and move to Starter or Growth plans for structured assessments, candidate management, and scorecards.";

export const INTERVIEW_TYPES = Object.freeze([
    "Coding rounds with code execution in JavaScript, Python, Java, and C++",
    "Live system-design discussion with an architecture canvas and interviewer interjections",
    ...debuggingItems("Debugging rounds on multi-file projects, graded against hidden tests or written findings"),
    "Technical discussion by voice or text with adaptive follow-up questions",
    "Backend, distributed-systems, and project-depth rounds that probe resume claims",
    "Behavioral and ownership rounds",
]);

export const organizationSchema = () => ({
    "@type": "Organization",
    "@id": `${BRAND_URLS.landing}/#organization`,
    name: BRAND_NAME,
    legalName: BUSINESS_LEGAL_NAME,
    url: `${BRAND_URLS.landing}/`,
    logo: `${BRAND_URLS.landing}/favicon.svg`,
    description: BRAND_DESCRIPTION,
    slogan: BRAND_TAGLINE,
    sameAs: [...BRAND_SAME_AS],
});

export const softwareApplicationSchema = () => ({
    "@type": "SoftwareApplication",
    "@id": `${BRAND_URLS.landing}/#software`,
    name: BRAND_NAME,
    description: BRAND_DESCRIPTION,
    url: `${BRAND_URLS.landing}/`,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Technical interview practice and assessment",
    operatingSystem: "Web",
    featureList: [...INTERVIEW_TYPES],
    offers: { "@type": "Offer", price: "0", priceCurrency: "INR", name: "Free practice plan" },
    publisher: { "@id": `${BRAND_URLS.landing}/#organization` },
});

export const publisherRef = () => ({ "@id": `${BRAND_URLS.landing}/#organization` });

export const faqSchema = (faq = []) => (faq.length ? {
    "@type": "FAQPage",
    mainEntity: faq.map(([question, answer]) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
    })),
} : null);

export const breadcrumbSchema = (items = []) => ({
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, url], index) => ({ "@type": "ListItem", position: index + 1, name, item: url })),
});
