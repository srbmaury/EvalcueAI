import { useContext } from "react";
import { Link as RouterLink } from "react-router-dom";
import { ArrowForwardRounded, SchoolOutlined, WorkOutlineRounded } from "@mui/icons-material";
import { Box, Button, Chip, Container, Grid, Paper, Stack, Typography } from "@mui/material";
import { AuthContext } from "../context/AuthContext";
import SiteFooter from "../components/SiteFooter";
import { setWorkspacePreference } from "../utils/workspacePreference";
import { SEARCH_LANDING_PAGES } from "../utils/searchLandingPages";

const choices = [
    {
        workspace: "practice",
        eyebrow: "Practice workspace",
        title: "Prepare for interviews",
        body: "Run role-specific AI mock interviews and get clear feedback on what to improve next.",
        points: ["Voice, coding and system-design practice", "Job-description and resume context", "Feedback and progress tracking"],
        icon: SchoolOutlined,
    },
    {
        workspace: "hiring",
        eyebrow: "Hiring workspace",
        title: "Assess candidates",
        body: "Create structured technical assessments, invite candidates, and review consistent evidence in one place.",
        points: ["Structured assessment builder", "Candidate pipeline and reports", "Human-controlled hiring decisions"],
        icon: WorkOutlineRounded,
    },
];

export default function LandingPage() {
    const { user } = useContext(AuthContext);

    const destinationFor = (workspace) => {
        if (workspace === "hiring") return user ? "/hire/assessments" : "/hire/register";
        return user ? "/practice/dashboard" : "/practice/register";
    };

    const rememberWorkspace = (workspace) => {
        setWorkspacePreference(workspace, user?._id);
    };

    return (
        <Box component="section" sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <Box sx={(theme) => ({
                flex: 1,
                py: { xs: 7, md: 11 },
                display: "flex",
                alignItems: "center",
                background: theme.palette.mode === "dark"
                    ? "radial-gradient(circle at 50% 0%, rgba(124,92,255,.2), transparent 38%), #0b1020"
                    : "radial-gradient(circle at 50% 0%, rgba(99,91,255,.14), transparent 38%), linear-gradient(180deg,#f8f9ff,#fff)",
            })}>
                <Container maxWidth="lg">
                    <Stack spacing={2} alignItems="center" textAlign="center" mb={{ xs: 4, md: 6 }}>
                        <Chip label="Choose your Evalcue AI workspace" color="primary" variant="outlined" />
                        <Typography component="h1" sx={{ fontSize: { xs: "2.5rem", sm: "3.5rem", md: "4.4rem" }, lineHeight: 1, letterSpacing: "-.05em", fontWeight: 850, maxWidth: 820 }}>
                            AI interview practice for software engineers. Structured technical hiring for teams.
                        </Typography>
                        <Typography color="text.secondary" sx={{ fontSize: { xs: "1.05rem", md: "1.2rem" }, lineHeight: 1.65, maxWidth: 680 }}>
                            Practice realistic coding, system-design, debugging, and technical interviews with adaptive AI follow-ups—or build evidence-focused engineering assessments for your hiring team.
                        </Typography>
                    </Stack>

                    <Grid container spacing={3} justifyContent="center">
                        {choices.map((choice) => {
                            const Icon = choice.icon;
                            return (
                                <Grid size={{ xs: 12, md: 6 }} key={choice.workspace}>
                                    <Paper
                                        variant="outlined"
                                        sx={{
                                            p: { xs: 3.5, sm: 4.5 },
                                            height: "100%",
                                            borderRadius: 4,
                                            display: "flex",
                                            flexDirection: "column",
                                            transition: "transform .18s ease, box-shadow .18s ease, border-color .18s ease",
                                            "&:hover": { transform: "translateY(-3px)", boxShadow: "0 18px 50px rgba(40,48,100,.10)", borderColor: "primary.light" },
                                        }}
                                    >
                                        <Box sx={{ width: 48, height: 48, borderRadius: 3, display: "grid", placeItems: "center", bgcolor: "action.selected", color: "primary.main", mb: 3 }}>
                                            <Icon />
                                        </Box>
                                        <Typography variant="overline" color="primary.main" fontWeight={850}>{choice.eyebrow}</Typography>
                                        <Typography variant="h3" fontWeight={850} letterSpacing="-.035em" mt={.5}>{choice.title}</Typography>
                                        <Typography color="text.secondary" mt={1.5} lineHeight={1.7} sx={{ fontSize: "1.05rem" }}>{choice.body}</Typography>
                                        <Stack spacing={1.1} mt={3} mb={4}>
                                            {choice.points.map((point) => (
                                                <Typography key={point} color="text.secondary" sx={{ display: "flex", gap: 1.1, alignItems: "center" }}>
                                                    <Box component="span" sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "primary.main", flexShrink: 0 }} />
                                                    {point}
                                                </Typography>
                                            ))}
                                        </Stack>
                                        <Button
                                            component={RouterLink}
                                            to={destinationFor(choice.workspace)}
                                            onClick={() => rememberWorkspace(choice.workspace)}
                                            variant="contained"
                                            size="large"
                                            endIcon={<ArrowForwardRounded />}
                                            sx={{ mt: "auto", alignSelf: { xs: "stretch", sm: "flex-start" }, px: 3 }}
                                        >
                                            {user
                                                ? `Open ${choice.workspace === "hiring" ? "Hire" : "Practice"}`
                                                : choice.workspace === "hiring"
                                                    ? "Assess candidates"
                                                    : "Practice interviews"}
                                        </Button>
                                    </Paper>
                                </Grid>
                            );
                        })}
                    </Grid>

                    <Typography variant="body2" color="text.secondary" textAlign="center" mt={4}>
                        Separate product workspaces · Candidate practice stays private · Hiring decisions stay human-controlled
                    </Typography>

                    <Box component="section" sx={{ mt: { xs: 7, md: 9 } }} aria-labelledby="interview-guides-heading">
                        <Stack spacing={1.5} alignItems="center" textAlign="center" mb={4}>
                            <Typography variant="overline" color="primary.main" fontWeight={850}>Interview practice guides</Typography>
                            <Typography id="interview-guides-heading" component="h2" variant="h3" fontWeight={900} letterSpacing="-.035em">
                                Practice the exact interview round you need to improve.
                            </Typography>
                            <Typography color="text.secondary" sx={{ maxWidth: 720, lineHeight: 1.7 }}>
                                Start with a focused guide, then move directly into an adaptive Evalcue AI practice session.
                            </Typography>
                        </Stack>
                        <Grid container spacing={2}>
                            {SEARCH_LANDING_PAGES.slice(0, 4).map((page) => (
                                <Grid size={{ xs: 12, sm: 6 }} key={page.path}>
                                    <Paper
                                        component={RouterLink}
                                        to={page.path}
                                        variant="outlined"
                                        sx={{
                                            p: 2.75,
                                            height: "100%",
                                            display: "block",
                                            borderRadius: 3,
                                            color: "inherit",
                                            textDecoration: "none",
                                            "&:hover": { borderColor: "primary.main" },
                                        }}
                                    >
                                        <Typography component="h3" variant="h5" fontWeight={850}>{page.title}</Typography>
                                        <Typography color="text.secondary" mt={1} lineHeight={1.65}>{page.description}</Typography>
                                    </Paper>
                                </Grid>
                            ))}
                        </Grid>
                        <Stack direction="row" justifyContent="center" mt={3}>
                            <Button component={RouterLink} to="/technical-interview-practice" variant="text" endIcon={<ArrowForwardRounded />}>
                                Explore technical interview practice
                            </Button>
                        </Stack>
                    </Box>
                </Container>
            </Box>
            <SiteFooter />
        </Box>
    );
}
