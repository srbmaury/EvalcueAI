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
import { Box, Button, Container, Grid, Paper, Stack, Typography } from "@mui/material";
import { AuthContext } from "../context/AuthContext";
import SiteFooter from "../components/SiteFooter";
import { productHomePath, productLoginPath, productRegisterPath } from "../utils/productRoutes";
import { setWorkspacePreference } from "../utils/workspacePreference";

const COPY = {
    practice: {
        eyebrow: "Evalcue AI Practice",
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
        eyebrow: "Evalcue AI Hire",
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
    const ProductIcon = config.icon;
    const primaryPath = user ? productHomePath(workspace) : productRegisterPath(workspace);
    const secondaryPath = productLoginPath(workspace);

    const rememberSurface = () => setWorkspacePreference(workspace, user?._id);

    return (
        <Box component="section" sx={{ overflow: "hidden" }}>
            <Box sx={(theme) => ({
                py: { xs: 8, md: 11 },
                background: surface === "hiring"
                    ? theme.palette.mode === "dark"
                        ? "radial-gradient(circle at 50% 0%, rgba(31,156,142,.2), transparent 38%), #081412"
                        : "radial-gradient(circle at 50% 0%, rgba(31,156,142,.13), transparent 38%), linear-gradient(180deg,#f4fbf9,#fff)"
                    : theme.palette.mode === "dark"
                        ? "radial-gradient(circle at 50% 0%, rgba(124,92,255,.2), transparent 38%), #0b1020"
                        : "radial-gradient(circle at 50% 0%, rgba(99,91,255,.14), transparent 38%), linear-gradient(180deg,#f8f9ff,#fff)",
            })}>
                <Container maxWidth="md">
                    <Stack spacing={2.5} alignItems="center" textAlign="center">
                        <Box sx={{ width: 52, height: 52, borderRadius: 3, display: "grid", placeItems: "center", bgcolor: "action.selected", color: "primary.main" }}>
                            <ProductIcon />
                        </Box>
                        <Typography variant="overline" color="primary.main" fontWeight={900}>{config.eyebrow}</Typography>
                        <Typography component="h1" sx={{ fontSize: { xs: "2.7rem", sm: "3.8rem", md: "4.6rem" }, lineHeight: 1, letterSpacing: "-.052em", fontWeight: 850 }}>
                            {config.headline}
                        </Typography>
                        <Typography color="text.secondary" sx={{ fontSize: { xs: "1.05rem", md: "1.2rem" }, lineHeight: 1.65, maxWidth: 720 }}>
                            {config.subheadline}
                        </Typography>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} width={{ xs: "100%", sm: "auto" }} pt={1}>
                            <Button component={RouterLink} to={primaryPath} onClick={rememberSurface} variant="contained" size="large" endIcon={<ArrowForwardRounded />} sx={{ px: 3.5 }}>
                                {user ? `Open ${surface === "hiring" ? "Hire" : "Practice"}` : config.primary}
                            </Button>
                            {!user && (
                                <Button component={RouterLink} to={secondaryPath} onClick={rememberSurface} color="inherit" size="large" sx={{ px: 2.5 }}>
                                    {config.secondary}
                                </Button>
                            )}
                        </Stack>
                        <Typography variant="body2" color="text.secondary">{config.proof}</Typography>
                    </Stack>
                </Container>
            </Box>

            <Container maxWidth="lg" sx={{ py: { xs: 7, md: 9 } }}>
                <Stack spacing={1} alignItems="center" textAlign="center" mb={4}>
                    <Typography variant="overline" color="primary.main" fontWeight={850}>What you get</Typography>
                    <Typography variant="h3" fontWeight={850} letterSpacing="-.04em">
                        {surface === "hiring" ? "A focused hiring workflow." : "A focused practice loop."}
                    </Typography>
                </Stack>
                <Grid container spacing={3}>
                    {config.benefits.map((benefit) => {
                        const Icon = benefit.icon;
                        return (
                            <Grid size={{ xs: 12, md: 4 }} key={benefit.title}>
                                <Paper variant="outlined" sx={{ p: 3.5, height: "100%", borderRadius: 4 }}>
                                    <Box sx={{ color: "primary.main", mb: 2 }}><Icon /></Box>
                                    <Typography variant="h5" fontWeight={800}>{benefit.title}</Typography>
                                    <Typography color="text.secondary" mt={1} lineHeight={1.7}>{benefit.body}</Typography>
                                </Paper>
                            </Grid>
                        );
                    })}
                </Grid>
            </Container>

            <Box sx={{ bgcolor: "action.hover", py: { xs: 7, md: 8 } }}>
                <Container maxWidth="lg">
                    <Typography variant="overline" color="primary.main" fontWeight={850}>How it works</Typography>
                    <Grid container spacing={3} mt={1}>
                        {config.steps.map(([number, title, body]) => (
                            <Grid size={{ xs: 12, md: 4 }} key={number}>
                                <Stack spacing={1}>
                                    <Typography color="primary.main" fontWeight={900}>{number}</Typography>
                                    <Typography variant="h5" fontWeight={800}>{title}</Typography>
                                    <Typography color="text.secondary" lineHeight={1.65}>{body}</Typography>
                                </Stack>
                            </Grid>
                        ))}
                    </Grid>
                </Container>
            </Box>

            {surface === "hiring" && (
                <Container maxWidth="lg" sx={{ pt: { xs: 6, md: 7 } }}>
                    <Paper variant="outlined" sx={{ p: { xs: 3, md: 4 }, borderRadius: 4 }}>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
                            <ShieldOutlined color="primary" />
                            <Box>
                                <Typography fontWeight={850}>AI organizes evidence. People make employment decisions.</Typography>
                                <Typography variant="body2" color="text.secondary" mt={.5}>Evalcue AI Hire is designed for structured evidence collection and human review—not fully automated hiring decisions.</Typography>
                            </Box>
                        </Stack>
                    </Paper>
                </Container>
            )}

            <Container maxWidth="sm" sx={{ py: { xs: 7, md: 9 }, textAlign: "center" }}>
                <Typography variant="h4" fontWeight={850} letterSpacing="-.03em">
                    {surface === "hiring" ? "Ready to run a structured screen?" : "Ready for a focused practice session?"}
                </Typography>
                <Button component={RouterLink} to={primaryPath} onClick={rememberSurface} variant="contained" size="large" endIcon={<ArrowForwardRounded />} sx={{ mt: 3, px: 3.5 }}>
                    {user ? `Open ${surface === "hiring" ? "Hire" : "Practice"}` : config.primary}
                </Button>
            </Container>

            <SiteFooter />
        </Box>
    );
}
