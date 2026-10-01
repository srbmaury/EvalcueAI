import PublicSiteFrame from "../components/PublicSiteFrame";
import { useContext } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
    ArrowForwardRounded,
    DescriptionOutlined,
    GroupsRounded,
    InsightsRounded,
    PsychologyRounded,
    SchoolOutlined,
    ShieldOutlined,
    WorkOutlineRounded,
} from "@mui/icons-material";
import { Box, Button, Container, Grid, Link, Stack, Typography } from "@mui/material";
import { AuthContext } from "../context/AuthContext";
import SiteFooter from "../components/SiteFooter";
import { productHomePath, productLoginPath, productRegisterPath } from "../utils/productRoutes";
import { resourcePagesForSurface, resourcePathFor } from "../utils/productResourcePages";
import { setWorkspacePreference } from "../utils/workspacePreference";

const COPY = {
    practice: {
        eyebrow: "EvalcueAI Practice",
        icon: SchoolOutlined,
        headline: "Practice for the interview you actually have.",
        subheadline: "Use your target role, job description, and resume to run realistic technical interviews, then see exactly what to improve next.",
        primary: "Start practicing",
        secondary: "Sign in",
        proof: "Private practice workspace · Voice, coding and system design",
        benefits: [
            { icon: PsychologyRounded, title: "Realistic adaptive rounds", body: "Practice conversational, coding, and system-design interviews with follow-ups shaped by your answers." },
            { icon: DescriptionOutlined, title: "Your role and resume", body: "Use the job description and resume you actually plan to interview with instead of generic prompts." },
            { icon: InsightsRounded, title: "Clear feedback", body: "See weak areas, evidence, and practical next steps so the next practice session has a purpose." },
        ],
        steps: [
            ["01", "Set the target", "Add the role, job description, and resume context."],
            ["02", "Practice", "Run realistic technical rounds and adaptive follow-ups."],
            ["03", "Improve", "Review feedback and focus your next session on the gaps."],
        ],
    },
    hiring: {
        eyebrow: "EvalcueAI Hire",
        icon: WorkOutlineRounded,
        headline: "Screen technical candidates with clearer evidence.",
        subheadline: "Build structured assessments from the role, invite candidates with one link, and review consistent evidence before spending interviewer time.",
        primary: "Create hiring workspace",
        secondary: "Recruiter sign in",
        proof: "Organization-owned workspace · Candidate pipeline · Human-reviewed decisions",
        benefits: [
            { icon: GroupsRounded, title: "Structured assessments", body: "Turn the role into a repeatable technical assessment and manage every candidate in one hiring workspace." },
            { icon: PsychologyRounded, title: "Better technical signal", body: "Use adaptive follow-ups to probe competency gaps and resume claims instead of relying on a shallow fixed script." },
            { icon: ShieldOutlined, title: "Human-controlled decisions", body: "AI collects and organizes evidence while your team keeps ownership of calibration and hiring judgment." },
        ],
        steps: [
            ["01", "Define the role", "Create the scorecard and assessment from the job description."],
            ["02", "Invite candidates", "Share one link and collect structured technical evidence."],
            ["03", "Review", "Compare reports and decide where human interviewer time matters."],
        ],
    },
};

export default function ProductLandingPage({ surface = "practice" }) {
    const { user } = useContext(AuthContext);
    const config = COPY[surface] || COPY.practice;
    const workspace = surface === "hiring" ? "hiring" : "practice";
    const primaryPath = user ? productHomePath(workspace) : productRegisterPath(workspace);
    const secondaryPath = productLoginPath(workspace);
    const featuredResources = resourcePagesForSurface(workspace).slice(0, 3);

    const rememberSurface = () => setWorkspacePreference(workspace, user?._id);

    const hiring = workspace === "hiring";
    const accent = hiring ? "secondary.main" : "primary.main";

    return <PublicSiteFrame>
        <Container maxWidth="lg">
            <Grid container spacing={{ xs: 5, md: 8 }} alignItems="center" sx={{ py: { xs: 7, md: 10 } }}>
                <Grid size={{ xs: 12, md: 6 }}>
                    <Typography variant="overline">{config.eyebrow}</Typography>
                    <Typography component="h1" mt={2}>{config.headline}</Typography>
                    <Typography color="text.secondary" sx={{ fontSize: "1.12rem", lineHeight: 1.8, mt: 3 }}>{config.subheadline}</Typography>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} mt={4}>
                        <Button component={RouterLink} to={primaryPath} onClick={rememberSurface} variant="contained" color={hiring ? "secondary" : "primary"} size="large" endIcon={<ArrowForwardRounded />}>{user ? `Open ${hiring ? "Hire" : "Practice"}` : config.primary}</Button>
                        {!user && <Button component={RouterLink} to={secondaryPath} onClick={rememberSurface} variant="outlined" color="inherit" size="large">{config.secondary}</Button>}
                    </Stack>
                    <Typography variant="body2" color="text.secondary" lineHeight={1.7} mt={2}>{hiring ? "Your team reviews the evidence and makes the decision." : "Free plan: 3 interviews each month. No card required."}</Typography>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: "4px", overflow: "hidden" }}>
                        <Stack direction="row" justifyContent="space-between" gap={2} sx={{ p: 2.5, bgcolor: "action.hover", borderBottom: "1px solid", borderColor: "divider" }}>
                            <Typography variant="body2" fontWeight={600}>{hiring ? "Backend engineer · Assessment" : "System design · Session review"}</Typography>
                            <Typography variant="caption" color="text.secondary">Illustrative example</Typography>
                        </Stack>
                        <Box sx={{ p: { xs: 2.5, sm: 3.5 } }}>
                            <Typography variant="overline">{hiring ? "Assessment outline" : "Your target"}</Typography>
                            <Typography fontWeight={600} mt={1}>{hiring ? "Evaluate implementation and technical reasoning" : "Design a reliable payment service"}</Typography>
                            <Stack spacing={0} mt={3}>
                                {(hiring ? [
                                    ["01", "Coding", "Implement a request handler with safe retries."],
                                    ["02", "System design", "Explain consistency, scaling, and failure recovery."],
                                    ["03", "Technical discussion", "Explore the candidate’s decisions through follow-ups."],
                                ] : [
                                    ["01", "Requirements", "You identified retries and duplicate-charge prevention."],
                                    ["02", "Trade-offs", "Explain how concurrent requests share an idempotency key."],
                                    ["03", "Next practice", "Work through a failure between payment and confirmation."],
                                ]).map(([number, title, body]) => <Stack key={number} direction="row" spacing={2} sx={{ py: 2, borderTop: "1px solid", borderColor: "divider" }}>
                                    <Typography variant="caption" color={accent} pt={.4}>{number}</Typography>
                                    <Box><Typography variant="body2" fontWeight={600}>{title}</Typography><Typography variant="body2" color="text.secondary" mt={.5} lineHeight={1.7}>{body}</Typography></Box>
                                </Stack>)}
                            </Stack>
                            <Box sx={{ mt: 1, p: 2, bgcolor: "action.hover", borderLeft: "2px solid", borderColor: accent }}>
                                <Typography variant="body2" fontWeight={600}>{hiring ? "Reviewer evidence" : "Feedback grounded in your answers"}</Typography>
                                <Typography variant="body2" color="text.secondary" mt={.5} lineHeight={1.7}>{hiring ? "Review submitted code, interview responses, and rubric-based feedback before making a decision." : "Revisit the transcript and feedback, then repeat the areas that need more depth."}</Typography>
                            </Box>
                        </Box>
                    </Box>
                </Grid>
            </Grid>
            <Box component="section" sx={{ borderTop: "1px solid", borderColor: "divider", py: { xs: 6, md: 8 } }} aria-labelledby="product-benefits">
                <Typography variant="overline">{hiring ? "For engineering teams" : "For software engineers"}</Typography>
                <Typography component="h2" id="product-benefits" mt={1}>{hiring ? "A consistent process, from invite to review." : "Prepare, practice, and know what to work on."}</Typography>
                <Grid container spacing={4} mt={3}>
                    {config.benefits.map((benefit) => <Grid size={{ xs: 12, md: 4 }} key={benefit.title}>
                        <Box sx={{ borderTop: "2px solid", borderColor: accent, pt: 2.5 }}>
                            <Typography component="h3">{benefit.title}</Typography>
                            <Typography color="text.secondary" lineHeight={1.8} mt={1.5}>{benefit.body}</Typography>
                        </Box>
                    </Grid>)}
                </Grid>
            </Box>
        </Container>
        <Box component="section" sx={{ bgcolor: "action.hover", py: { xs: 6, md: 8 } }} aria-labelledby="product-workflow">
            <Container maxWidth="lg">
                <Typography variant="overline">How it works</Typography>
                <Typography component="h2" id="product-workflow" mt={1}>{hiring ? "From the role to the evidence." : "Make every session count."}</Typography>
                <Grid container spacing={4} mt={3}>
                    {config.steps.map(([number, title, body]) => <Grid size={{ xs: 12, md: 4 }} key={number}>
                        <Typography variant="caption" color={accent}>{number}</Typography>
                        <Typography component="h3" mt={1}>{title}</Typography>
                        <Typography color="text.secondary" lineHeight={1.8} mt={1}>{body}</Typography>
                    </Grid>)}
                </Grid>
            </Container>
        </Box>
        <Container maxWidth="lg" sx={{ py: { xs: 6, md: 8 } }}>
            <Grid container spacing={5}>
                <Grid size={{ xs: 12, md: 4 }}>
                    <Typography variant="overline">{hiring ? "Assessment resources" : "Practice resources"}</Typography>
                    <Typography component="h2" mt={1}>{hiring ? "Start with a role-specific template." : "Choose the round you want to improve."}</Typography>
                    <Typography color="text.secondary" lineHeight={1.8} mt={2}>{hiring ? "Use a resource as a starting point, then adapt it to the role and your team’s rubric." : "Read the guide and carry its context into a focused interview session."}</Typography>
                </Grid>
                <Grid size={{ xs: 12, md: 8 }}>
                    {featuredResources.map((page) => <Box component={RouterLink} to={resourcePathFor(page)} key={page.slug} sx={{ display: "flex", gap: 3, justifyContent: "space-between", py: 2.5, borderBottom: "1px solid", borderColor: "divider", color: "inherit", textDecoration: "none", "&:first-of-type": { pt: 0 }, "&:hover h3": { color: accent } }}>
                        <Box><Typography component="h3">{page.title}</Typography><Typography color="text.secondary" mt={1} lineHeight={1.7}>{page.description}</Typography></Box>
                        <ArrowForwardRounded sx={{ fontSize: 20, flexShrink: 0, color: accent, mt: .5 }} />
                    </Box>)}
                </Grid>
            </Grid>
            <Stack direction={{ xs: "column", md: "row" }} spacing={3} justifyContent="space-between" alignItems={{ md: "center" }} sx={{ mt: { xs: 6, md: 8 }, pt: 5, borderTop: "1px solid", borderColor: "divider" }}>
                <Box><Typography component="h2">{hiring ? "Build your next technical assessment." : "Begin your next practice session."}</Typography><Typography color="text.secondary" mt={1}>{hiring ? "Keep the process structured and the final judgment with your team." : "Bring your target role. Leave with a clearer next step."}</Typography></Box>
                <Button component={RouterLink} to={primaryPath} onClick={rememberSurface} variant="contained" color={hiring ? "secondary" : "primary"} size="large" endIcon={<ArrowForwardRounded />} sx={{ flexShrink: 0 }}>{user ? `Open ${hiring ? "Hire" : "Practice"}` : config.primary}</Button>
            </Stack>
            <Link component={RouterLink} to="/docs" underline="hover" color="text.secondary" sx={{ display: "inline-block", mt: 3 }}>Read the product documentation →</Link>
        </Container>
        <SiteFooter />
    </PublicSiteFrame>;
}
