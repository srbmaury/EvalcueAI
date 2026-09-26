import { Box, Card, CardActionArea, CardContent, Chip, Container, Divider, Stack, Typography } from "@mui/material";
import { Link as RouterLink, useLocation } from "react-router-dom";
import Seo from "../components/Seo";
import SiteFooter from "../components/SiteFooter";

const articles = {
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

const cards = [
    ["Structured technical assessments", "/docs/technical-hiring/structured-technical-assessments", "Build job-relevant rounds, evidence, and consistent rubrics."],
    ["System design interviews", "/docs/technical-hiring/system-design-interviews", "Evaluate reasoning, scale, reliability, and trade-offs."],
    ["Interview scorecards", "/docs/technical-hiring/interview-scorecards", "Use evidence-backed ratings and explicit human review."],
    ["AI interview practice", "/docs/candidates/ai-interview-practice", "Turn repeated practice into deliberate improvement."],
    ["Integrity & human review", "/docs/security/human-review-and-integrity-signals", "Use candidate signals proportionately and responsibly."],
    ["OIDC work SSO", "/docs/hiring/oidc-sso", "Configure enterprise organization sign-in with an OpenID Connect provider."],
];

export default function PublicDocsPage() {
    const { pathname } = useLocation();
    const article = articles[pathname];

    if (!article) {
        const title = "EvalcueAI Documentation | Technical interviews and hiring";
        const description = "Practical documentation for structured technical assessments, system design interviews, candidate scorecards, AI interview practice, enterprise SSO, and responsible human review.";
        return (
            <Box>
                <Container maxWidth="lg" sx={{ py: { xs: 5, md: 9 } }}>
                    <Seo title={title} description={description} canonicalPath="/docs" structuredData={{ "@context": "https://schema.org", "@type": "CollectionPage", name: "EvalcueAI Documentation", description }} />
                    <Stack spacing={2} maxWidth={780}>
                        <Chip label="Documentation" color="primary" variant="outlined" sx={{ alignSelf: "flex-start" }} />
                        <Typography component="h1" variant="h2" fontWeight={900} letterSpacing="-.04em">Technical interview documentation built around evidence.</Typography>
                        <Typography variant="h6" color="text.secondary">Guides for engineering teams designing assessments and candidates preparing for technical interviews.</Typography>
                    </Stack>
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" }, gap: 2, mt: 5 }}>
                        {cards.map(([name, path, summary]) => (
                            <Card key={path} variant="outlined" sx={{ borderRadius: 4 }}>
                                <CardActionArea component={RouterLink} to={path} sx={{ height: "100%" }}>
                                    <CardContent sx={{ p: 3 }}>
                                        <Typography component="h2" variant="h5" fontWeight={800}>{name}</Typography>
                                        <Typography color="text.secondary" mt={1}>{summary}</Typography>
                                    </CardContent>
                                </CardActionArea>
                            </Card>
                        ))}
                    </Box>
                </Container>
                <SiteFooter />
            </Box>
        );
    }

    const canonicalPath = pathname;
    const title = `${article.title} | EvalcueAI Docs`;
    return (
        <Box>
            <Container maxWidth="md" sx={{ py: { xs: 5, md: 9 } }}>
                <Seo title={title} description={article.description} canonicalPath={canonicalPath} structuredData={{ "@context": "https://schema.org", "@type": "Article", headline: article.title, description: article.description, author: { "@type": "Organization", name: "EvalcueAI" }, publisher: { "@type": "Organization", name: "EvalcueAI" }, mainEntityOfPage: `${window.location.origin}${canonicalPath}` }} />
                <Stack spacing={2}>
                    <Typography component={RouterLink} to="/docs" color="primary.main" sx={{ textDecoration: "none", fontWeight: 800 }}>← Documentation</Typography>
                    <Typography variant="overline" color="primary.main" fontWeight={850}>{article.eyebrow}</Typography>
                    <Typography component="h1" variant="h2" fontWeight={900} letterSpacing="-.04em">{article.title}</Typography>
                    <Typography variant="h6" color="text.secondary">{article.description}</Typography>
                </Stack>
                <Divider sx={{ my: 5 }} />
                <Stack spacing={5}>
                    {article.sections.map(([heading, body]) => (
                        <Box component="section" key={heading}>
                            <Typography component="h2" variant="h4" fontWeight={850}>{heading}</Typography>
                            <Typography sx={{ mt: 1.5, fontSize: "1.08rem", lineHeight: 1.8 }} color="text.secondary">{body}</Typography>
                        </Box>
                    ))}
                </Stack>
                <Divider sx={{ my: 5 }} />
                <Typography component={RouterLink} to="/docs" color="primary.main" sx={{ textDecoration: "none", fontWeight: 800 }}>Browse all EvalcueAI documentation →</Typography>
            </Container>
            <SiteFooter />
        </Box>
    );
}
