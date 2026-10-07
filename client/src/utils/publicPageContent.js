// Public docs and legal copy shared by the React pages and the build-time prerender in vite.config.js.
// Keep this module free of React/MUI imports so the build can load it directly.

export const DOCS_ARTICLES = {
    "/docs/technical-hiring/structured-technical-assessments": {
        title: "How to design structured technical assessments",
        description: "A practical guide to building consistent technical assessments with job-relevant rounds, evidence, scorecards, and human review.",
        eyebrow: "Technical hiring",
        sections: [
            ["Start with evidence, not question volume", "A useful assessment should answer a hiring question: what technical evidence do we need before committing engineer-hours to a live interview? Define the role outcomes first, then choose coding, discussion, or system-design rounds that produce evidence for those outcomes."],
            ["Keep the assessment job-relevant", "Use the job description as context, but avoid copying trivia from it. Focus on skills the person will actually use: debugging, API design, data modelling, trade-off reasoning, coding, communication, and system thinking where relevant."],
            ["Use a shared rubric", "A shared scorecard reduces reviewer drift. Define a small set of competencies, describe what strong and weak evidence looks like, and score the candidate against the same rubric. AI-generated scores can be a signal, but the final hiring interpretation should remain human-reviewed."],
            ["Separate setup from candidate evidence", "Assessment definitions, invitations, attempts, reports, and reviewer decisions should be distinct. That makes versioning and comparisons safer and prevents edits to a future assessment from silently changing evidence from completed candidates."],
        ],
    },
    "/docs/technical-hiring/system-design-interviews": {
        title: "System design interviews: what to evaluate",
        description: "Evaluate requirements, APIs, data models, architecture, scaling choices, failure handling, and trade-offs without reducing system design to buzzword counting.",
        eyebrow: "Technical hiring",
        sections: [
            ["Evaluate the reasoning path", "A strong system-design response is more than a final diagram. Look for requirement clarification, sensible scope, core objects and APIs, data ownership, expected traffic, failure modes, and explicit trade-offs."],
            ["Do not reward architecture jargon", "Kafka, Redis, sharding, queues, and caches are useful only when they solve a stated problem. A smaller architecture with clear reasoning is often stronger than a diagram packed with infrastructure names."],
            ["Probe important assumptions", "Good follow-ups test the candidate’s model: what happens when traffic spikes, a dependency fails, two users update the same resource, data must be deleted, or a hotspot appears? The goal is to reveal engineering judgment, not to force one canonical design."],
            ["Capture evidence by dimension", "Store evidence separately for requirements, API design, data model, high-level architecture, scale, reliability, and trade-offs. This makes reviewer decisions more explainable than a single opaque score."],
        ],
    },
    "/docs/technical-hiring/interview-scorecards": {
        title: "Technical interview scorecards and human review",
        description: "Build structured interview scorecards that make candidate evidence easier to compare while keeping hiring decisions with human reviewers.",
        eyebrow: "Technical hiring",
        sections: [
            ["Use a small competency set", "Scorecards work best when each criterion is meaningful. Typical technical criteria include correctness, problem decomposition, debugging, system reasoning, communication, and role-specific depth."],
            ["Require evidence for ratings", "A score without evidence is hard to audit. Ask reviewers to reference the candidate’s answer, code, design choice, or follow-up response that supports the rating."],
            ["Keep AI and human judgment distinct", "Automated analysis can summarize evidence and identify follow-up areas. Human reviewers should remain responsible for interpreting that evidence in the context of the role and for making employment decisions."],
            ["Compare consistently", "Use the same assessment version and rubric when possible. If a role changes materially, create a new version instead of mutating the original and mixing candidates across different evaluation standards."],
        ],
    },
    "/docs/candidates/ai-interview-practice": {
        title: "How to use AI interview practice effectively",
        description: "Use AI interview practice to rehearse role-specific technical answers, coding, and system design while improving the evidence and clarity in your responses.",
        eyebrow: "For candidates",
        sections: [
            ["Practice the explanation, not just the answer", "Interview performance depends on how you frame assumptions, constraints, alternatives, and trade-offs. After solving a problem, explain why your approach is appropriate and what you would change at larger scale."],
            ["Use realistic role context", "Practice against the type of job you want. A backend interview should emphasize APIs, data, concurrency, reliability, and system reasoning differently from a frontend or mobile interview."],
            ["Review recurring weaknesses", "Look for patterns across sessions: unclear requirements, missing edge cases, weak complexity analysis, shallow project explanations, or architecture choices without justification. Improving a repeated weakness is more valuable than completing many disconnected mock questions."],
            ["Treat feedback as coaching, not truth", "AI feedback can help identify gaps and generate follow-ups, but it can be wrong or incomplete. Validate technical claims and use the feedback to drive deliberate practice rather than memorizing model answers."],
        ],
    },
    "/docs/security/human-review-and-integrity-signals": {
        title: "Candidate integrity signals and responsible human review",
        description: "How to use assessment integrity signals carefully: collect proportionately, explain them to candidates, retain them briefly, and never treat a signal as proof of misconduct.",
        eyebrow: "Trust & security",
        sections: [
            ["Collect only what the assessment needs", "Integrity controls should be proportionate to the role and assessment. Explain any fullscreen, focus, camera, clipboard, or connectivity monitoring before the candidate starts and require explicit consent where appropriate."],
            ["Signals are context, not verdicts", "A tab change, missing face frame, or connection interruption can have innocent explanations. Present integrity events to reviewers as contextual signals, not automatic cheating decisions."],
            ["Use bounded retention", "Integrity event data should have a defined retention period and be deleted when it is no longer needed. Keep the retention policy visible to the organization and the candidate experience."],
            ["Keep the employment decision human", "Automated systems can summarize technical evidence and flag events for review. They should not independently make or recommend final employment decisions without meaningful human oversight."],
        ],
    },
};

export const DOCS_CARDS = [
    ["Structured technical assessments", "/docs/technical-hiring/structured-technical-assessments", "Build job-relevant rounds, evidence, and consistent rubrics."],
    ["System design interviews", "/docs/technical-hiring/system-design-interviews", "Evaluate reasoning, scale, reliability, and trade-offs."],
    ["Interview scorecards", "/docs/technical-hiring/interview-scorecards", "Use evidence-backed ratings and explicit human review."],
    ["AI interview practice", "/docs/candidates/ai-interview-practice", "Turn repeated practice into deliberate improvement."],
    ["Integrity & human review", "/docs/security/human-review-and-integrity-signals", "Use candidate signals proportionately and responsibly."],
    ["OIDC work SSO", "/docs/hiring/oidc-sso", "Configure enterprise organization sign-in with an OpenID Connect provider."],
];

export const OIDC_SSO_DOC = {
    title: "Configure OpenID Connect work SSO",
    description: "Configure organization-level OIDC single sign-on for EvalcueAI Hiring using Microsoft Entra ID, Okta, Auth0, Google Workspace, or another OpenID Connect provider.",
    eyebrow: "Enterprise access",
    notice: "Organization SSO is a Hiring Enterprise capability. EvalcueAI uses OIDC Authorization Code flow with PKCE and maps the verified identity into the organization’s existing role and session model.",
    steps: [
        ["1. Create an OIDC application in your identity provider", "Use Microsoft Entra ID, Okta, Auth0, Google Workspace, or another standards-compliant OpenID Connect provider. Configure an authorization-code web application and keep its client secret private."],
        ["2. Register the EvalcueAI callback URL", "Set the redirect URI to your EvalcueAI API origin followed by /api/sso/callback. The URI must exactly match the redirect registered with your identity provider."],
        ["3. Copy the issuer, client ID, and client secret", "The issuer should be the provider’s OpenID Connect issuer URL—not an authorization endpoint copied by hand. EvalcueAI validates discovery metadata before enabling the configuration."],
        ["4. Claim your work email domains", "Add the organization domains whose asserted email identities may enter this EvalcueAI organization. A domain can be enabled for only one organization at a time."],
        ["5. Choose membership provisioning", "With just-in-time provisioning disabled, an Owner or Admin must add the user to the organization before SSO succeeds. With JIT enabled, a successful identity can be added automatically using the configured default role."],
        ["6. Test with a least-privilege account", "Start with Reviewer as the JIT default and validate a non-admin user before rolling SSO out broadly. Owner and Admin roles are never issued through JIT provisioning."],
    ],
    securityBehavior: [
        "OIDC issuer and discovered endpoints must use public HTTPS endpoints.",
        "State, nonce, and PKCE protect the browser authorization flow.",
        "ID tokens are verified for signature, issuer, audience, nonce, and allowed work email domain.",
        "Client secrets are encrypted at rest and never returned by the settings API.",
        "The browser receives a short-lived, single-use EvalcueAI exchange code rather than an access token in the redirect URL.",
        "Disabled or removed organization membership blocks session exchange even after the identity provider has authenticated the user.",
    ],
};

export const PRIVACY_SECTIONS = [
    ["Scope and operator", "This policy explains how SAURABH MAURYA, operating EvalcueAI, handles personal information when you use our website, interview practice, resume tools, and technical hiring assessments. For assessments arranged by an employer, the recruiting organization also determines how it uses candidate information; contact that organization about its recruitment records and decisions."],
    ["Information we collect", "We process account and contact details, authentication information, resumes and extracted text, target-role information, interview answers, submitted code, assessment results, generated feedback, and audio you submit for transcription. We also process service usage, security and operational logs, and billing status when you purchase a plan. Please avoid submitting unnecessary sensitive information or personal information belonging to others."],
    ["Why we process information", "Account information supports authentication, account administration, and support. Resumes, role details, answers, and code enable the practice, resume, and assessment features you request. Audio enables transcription. Usage and security records support plan limits, abuse prevention, troubleshooting, and service reliability. Billing information supports checkout, subscription management, and invoices."],
    ["Service providers and payments", "Depending on the features you use, content may be processed by configured AI providers such as OpenAI or Google Gemini, Cloudinary for resume storage, Tavily for web research, and email or monitoring providers. PayU processes payments and recurring mandates; payment details entered into its checkout are handled by PayU. Submitted code runs on our isolated code-execution service. These providers may process information in countries other than your own, subject to their terms and privacy practices."],
    ["Voice and device permissions", "When you answer by voice, recorded audio is transcribed by our configured speech-to-text provider, currently OpenAI. Your browser’s built-in speech recognition may also process audio to display live text; Chrome may send this audio to Google’s speech service. Microphone and camera access require browser permission. You can revoke these permissions in your browser settings and use supported text-based alternatives."],
    ["Recruiting assessments", "When you complete an assessment shared by a recruiting team, your name, email, answers, AI-generated scores, feedback, and any consented integrity events are available to the assessment owner. Optional face-presence checks run on your device; camera frames are not stored or uploaded. Candidates receive submission confirmation; private evaluation reports are available to the recruiting team. Questions about recruitment decisions or employer-held copies should be directed to that team."],
    ["Retention and deletion", "You can delete individual resumes and request permanent account deletion from your profile. Account deletion removes account records and associated personal practice data through our deletion workflow. Recruiting records controlled by an organization, billing records, provider backups, and security or operational logs may have separate retention requirements. Contact support with questions about a specific record or a deletion request; deleting your account does not itself cancel a paid subscription."],
    ["Your choices and requests", "You can update account information, remove resumes, delete your account, and decline optional device permissions. Contact support to request access, correction, or deletion of personal information, to raise a privacy concern, or to ask about rights available under applicable law. We may need to verify your identity before acting on a request. Withdrawing permission for information required by a feature may prevent us from providing that feature."],
    ["Cookies and security", "We use authentication cookies and browser storage to support sign-in and service functionality. We use access controls, encrypted transport, session protections, rate limits, audit logging, and file validation to protect information. No online service can guarantee absolute security. Keep your account credentials secure and report suspected unauthorized access to support."],
    ["Updates to this policy", "We may update this policy as our services or data practices change. The effective date identifies the latest version. Material changes will be communicated through appropriate service notices. Contact support if you need clarification about a change."],
];

export const TERMS_SECTIONS = [
    ["Agreement and operator", "These terms govern your use of EvalcueAI, operated by SAURABH MAURYA. By creating an account, purchasing a service, or using the platform, you agree to these terms. If you use EvalcueAI for an organization, you must have authority to act on its behalf. Any separately agreed written service agreement applies to the extent it expressly overrides these terms."],
    ["Our services", "EvalcueAI provides AI-assisted interview practice, resume tools, and structured technical hiring assessments. Plan descriptions identify included features, usage limits, and access periods. Practice feedback is educational; the service does not guarantee an interview, job offer, assessment score, or employment outcome."],
    ["Accounts and access", "Provide accurate account information, protect your credentials, and use only accounts and organization resources you are authorized to access. You are responsible for activity under your account and should promptly report suspected unauthorized use. Organization owners and administrators are responsible for managing team access and assessment permissions."],
    ["Prices, payments, and subscriptions", "The selected plan and checkout show the price, currency, billing period, and applicable taxes before payment. Recurring subscriptions renew according to the terms shown at checkout until canceled through billing management. The Launch Pilot is a one-time purchase with the candidate capacity and validity period shown in its offer. Usage limits and access periods apply; account deletion alone does not cancel a subscription."],
    ["Cancellation and billing questions", "Use billing management to review invoices, update payment methods, and cancel recurring subscriptions. Review the confirmation for the date cancellation takes effect. For a disputed charge or refund request, contact support with the relevant invoice and a description of the issue. Any expressly agreed refund terms and rights required by applicable law remain applicable."],
    ["Acceptable use", "Do not access another person’s information without authorization, impersonate someone, evade plan or security limits, disrupt the service, upload malicious files, or use code execution to attack systems. Submit only content you are entitled to use. Candidates must follow the assessment owner’s instructions and must not misrepresent their identity or the authorship of submitted work."],
    ["Your content and our platform", "You retain ownership of content you submit. You grant us permission to store, process, transmit to service providers, and display that content as needed to deliver the features you request, including sharing assessment submissions and reports with the recruiting organization. EvalcueAI branding, software, and platform materials remain the property of their respective owners; access to the service does not transfer ownership."],
    ["AI output and hiring decisions", "AI-generated questions, feedback, scores, and resume suggestions may be inaccurate, incomplete, or biased. Review outputs before relying on them and verify factual claims before using generated resumes. Recruiting teams must independently review evidence and must not use an AI score or report as the sole basis for a hiring decision. Assessment owners remain responsible for lawful recruitment practices and appropriate candidate notices."],
    ["Privacy and candidate information", "Our Privacy Policy describes how we process personal information. Recruiting organizations are responsible for their use of candidate data, their access permissions, and any required notices or permissions for assessments. Do not upload third-party personal information unless you have the necessary authority."],
    ["Availability and suspension", "We may perform maintenance, update features, or restrict access to address misuse, security incidents, or legal requirements. We do not promise uninterrupted or error-free service. Where reasonably practicable, we will communicate material changes affecting paid access. You may stop using the service and delete your account, subject to separately managing any active subscription."],
    ["Responsibility and applicable rights", "Use the service with appropriate independent judgment. We do not warrant that AI outputs will be suitable for every purpose. Nothing in these terms excludes obligations, remedies, or consumer rights that cannot lawfully be excluded under applicable law. Contact support about service issues or disputes so we can investigate and seek a resolution."],
    ["Changes to these terms", "The effective date identifies the current version. We may revise these terms as the service changes and will communicate material updates through appropriate service notices. Review updated terms before continuing to use the affected services."],
];
