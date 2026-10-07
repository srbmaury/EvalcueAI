// Titles and descriptions for the fixed public routes. PublicRouteSeo applies them in the browser and
// vite.config.js prerenders them, so the static HTML and the hydrated page carry the same metadata.
import { HOME_DESCRIPTION, HOME_TITLE } from "./brandEntity.js";

export const PUBLIC_ROUTE_META = {
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
    "/plans": {
        title: "Pricing | EvalcueAI Practice and Hire",
        description: "Practice Pro ₹699 per month. Hire Pilot ₹2,999 one-time, Starter ₹9,999 per month, and Growth ₹29,999 per month. Prices in INR.",
        schema: "WebPage",
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
