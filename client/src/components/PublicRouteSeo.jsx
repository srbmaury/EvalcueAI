/* eslint-disable react-refresh/only-export-components */
import { useLocation } from "react-router-dom";
import Seo from "./Seo";
import { RESOURCE_ROUTE_META, SEARCH_ROUTE_META } from "virtual:seo-route-meta";
import { deploymentOrigins } from "../utils/deploymentSurface";
import { BRAND_NAME, HOME_DESCRIPTION, HOME_TITLE, organizationSchema, publisherRef, softwareApplicationSchema } from "../utils/brandEntity";

const ROUTES = {
    "/": {
        title: HOME_TITLE,
        description: HOME_DESCRIPTION,
        schema: "WebSite",
    },
    "/practice": {
        title: "AI Technical Interview Practice for Software Engineers | EvalcueAI",
        description: "Practice role-specific software engineering interviews with adaptive follow-ups, coding rounds, system design, resume context, and evidence-backed feedback.",
        schema: "EducationalApplication",
    },
    "/hire": {
        title: "Structured Technical Hiring & AI Candidate Assessments | EvalcueAI",
        description: "Create structured engineering assessments, invite candidates, run adaptive technical interviews, and review evidence-rich scorecards with human-controlled hiring decisions.",
        schema: "BusinessApplication",
    },
    "/docs": {
        title: "EvalcueAI Documentation | Interview Practice & Technical Hiring",
        description: "Learn how EvalcueAI interview practice, technical assessments, system design discussions, scorecards, security controls, and hiring workflows work.",
        schema: "WebPage",
    },
    "/docs/technical-hiring/structured-technical-assessments": {
        title: "Structured Technical Assessments | EvalcueAI Docs",
        description: "Design structured technical assessments with role-specific rounds, adaptive interviews, candidate invitations, and evidence-led recruiter review.",
        schema: "TechArticle",
    },
    "/docs/technical-hiring/system-design-interviews": {
        title: "System Design Interviews with Live AI Discussion | EvalcueAI Docs",
        description: "See how EvalcueAI combines an Excalidraw architecture canvas, live interviewer prompts, candidate discussion, and human-reviewed system design evidence.",
        schema: "TechArticle",
    },
    "/docs/technical-hiring/interview-scorecards": {
        title: "Technical Interview Scorecards & Calibration | EvalcueAI Docs",
        description: "Use weighted competencies, evidence-rich scorecards, human overrides, and calibration workflows for more consistent technical hiring reviews.",
        schema: "TechArticle",
    },
    "/docs/candidates/ai-interview-practice": {
        title: "AI Interview Practice for Software Engineers | EvalcueAI Docs",
        description: "Prepare for conversational, coding, and system design interviews with role context, adaptive questioning, and post-interview feedback.",
        schema: "TechArticle",
    },
    "/docs/security/human-review-and-integrity-signals": {
        title: "Human Review, Integrity Signals & Candidate Privacy | EvalcueAI Docs",
        description: "Understand EvalcueAI candidate privacy, consented integrity signals, human-only interpretation, and safeguards around AI-assisted hiring evidence.",
        schema: "TechArticle",
    },
    "/docs/hiring/oidc-sso": {
        title: "OIDC SSO for Hiring Organizations | EvalcueAI Docs",
        description: "Configure organization OIDC single sign-on for EvalcueAI Hire with secure client-secret storage and enterprise access controls.",
        schema: "TechArticle",
    },
    "/privacy": {
        title: "Privacy Notice | EvalcueAI",
        description: "Read how EvalcueAI handles account data, resumes, interview answers, candidate assessments, AI processing, integrity signals, retention, and deletion.",
        schema: "WebPage",
    },
    "/terms": {
        title: "Terms of Use | EvalcueAI",
        description: "Read the EvalcueAI terms for interview practice, technical assessments, acceptable use, AI limitations, account use, and user-submitted content.",
        schema: "WebPage",
    },
};

export const seoForPath = (pathname) => {
    if (ROUTES[pathname]) return { ...ROUTES[pathname], canonicalPath: pathname };
    if (SEARCH_ROUTE_META[pathname]) return { ...SEARCH_ROUTE_META[pathname], canonicalPath: pathname };
    if (RESOURCE_ROUTE_META[pathname]) return { ...RESOURCE_ROUTE_META[pathname], canonicalPath: pathname };
    if (pathname.startsWith("/docs/")) return { ...ROUTES["/docs"], canonicalPath: pathname };
    return null;
};

const structuredDataFor = (config, canonicalUrl) => {
    const common = {
        "@context": "https://schema.org",
        name: config.title,
        description: config.description,
        url: canonicalUrl,
    };
    if (config.schema === "EducationalApplication" || config.schema === "BusinessApplication") {
        return {
            ...common,
            "@type": "SoftwareApplication",
            applicationCategory: config.schema,
            operatingSystem: "Web",
            publisher: publisherRef(),
        };
    }
    if (config.schema === "WebSite") {
        return {
            "@context": "https://schema.org",
            "@graph": [
                { "@type": "WebSite", name: BRAND_NAME, alternateName: "Evalcue", description: config.description, url: canonicalUrl, publisher: publisherRef() },
                organizationSchema(),
                softwareApplicationSchema(),
            ],
        };
    }
    return { ...common, "@type": config.schema || "WebPage", publisher: publisherRef() };
};

export default function PublicRouteSeo() {
    const { pathname } = useLocation();
    const config = seoForPath(pathname);
    if (!config) return null;
    const origins = deploymentOrigins();
    const configuredOrigin = String(import.meta.env.VITE_PUBLIC_ORIGIN || "").trim();
    const isHiringRoute = pathname === "/hire" || pathname.startsWith("/hire/");
    const isPracticeRoute = pathname === "/practice" || pathname.startsWith("/practice/");
    const defaultOrigin = isHiringRoute
        ? origins.hiring
        : isPracticeRoute
            ? origins.practice
            : origins.landing;
    let origin = defaultOrigin || window.location.origin;
    // Ignore a landing-only override for a public route hosted on another production surface.
    if (configuredOrigin && !(isHiringRoute && origins.hiring) && !(isPracticeRoute && origins.practice)) {
        try { origin = new URL(configuredOrigin).origin; } catch { /* use surface default */ }
    }
    const canonicalUrl = new URL(config.canonicalPath, `${origin}/`).href;
    return (
        <Seo
            title={config.title}
            description={config.description}
            canonicalPath={config.canonicalPath}
            structuredData={structuredDataFor(config, canonicalUrl)}
        />
    );
}
