import { Link as RouterLink, Navigate, useLocation } from "react-router-dom";
import {
    ArrowForwardRounded,
    CheckCircleOutlineRounded,
    SchoolOutlined,
} from "@mui/icons-material";
import {
    Box,
    Button,
    Chip,
    Container,
    Divider,
    Grid,
    Paper,
    Stack,
    Typography,
} from "@mui/material";
import SiteFooter from "../components/SiteFooter";
import { searchLandingPageForPath, searchLandingPageForSlug } from "../utils/searchLandingPages";
import { externalSurfaceUrl } from "../utils/deploymentSurface";

export default function SearchLandingPage() {
    const { pathname } = useLocation();
    const page = searchLandingPageForPath(pathname);

    if (!page) return <Navigate to="/" replace />;

    const practicePath = `/practice/resources/${page.practiceResource}`;
    const practiceUrl = externalSurfaceUrl("practice", practicePath);

    return (
        <Box component="article" sx={{ overflow: "hidden" }}>
            <Box sx={(theme) => ({
                py: { xs: 7, md: 11 },
                background: theme.palette.mode === "dark"
                    ? "radial-gradient(circle at 50% 0%, rgba(124,92,255,.18), transparent 42%), #0b1020"
                    : "radial-gradient(circle at 50% 0%, rgba(99,91,255,.12), transparent 42%), linear-gradient(180deg,#f8f9ff,#fff)",
            })}>
                <Container maxWidth="lg">
                    <Grid container spacing={{ xs: 4, md: 7 }} alignItems="center">
                        <Grid size={{ xs: 12, md: 8 }}>
                            <Stack spacing={2.25}>
                                <Typography
                                    component={RouterLink}
                                    to="/"
                                    color="primary.main"
                                    sx={{ textDecoration: "none", fontWeight: 800, alignSelf: "flex-start" }}
                                >
                                    Evalcue AI
                                </Typography>
                                <Chip label={page.eyebrow} color="primary" variant="outlined" sx={{ alignSelf: "flex-start" }} />
                                <Typography
                                    component="h1"
                                    sx={{
                                        fontSize: { xs: "2.6rem", sm: "3.6rem", md: "4.5rem" },
                                        lineHeight: 1.02,
                                        letterSpacing: "-.05em",
                                        fontWeight: 900,
                                        maxWidth: 900,
                                    }}
                                >
                                    {page.title}
                                </Typography>
                                <Typography
                                    color="text.secondary"
                                    sx={{ fontSize: { xs: "1.05rem", md: "1.22rem" }, lineHeight: 1.75, maxWidth: 800 }}
                                >
                                    {page.intro}
                                </Typography>
                                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} pt={1}>
                                    <Button
                                        component="a"
                                        href={practiceUrl}
                                        variant="contained"
                                        size="large"
                                        endIcon={<ArrowForwardRounded />}
                                    >
                                        Start AI interview practice
                                    </Button>
                                    <Button
                                        component={RouterLink}
                                        to="/docs/candidates/ai-interview-practice"
                                        variant="outlined"
                                        size="large"
                                    >
                                        Read the practice guide
                                    </Button>
                                </Stack>
                            </Stack>
                        </Grid>
                        <Grid size={{ xs: 12, md: 4 }}>
                            <Paper variant="outlined" sx={{ p: 3, borderRadius: 4 }}>
                                <SchoolOutlined color="primary" sx={{ fontSize: 38 }} />
                                <Typography variant="h5" fontWeight={850} mt={2}>Practice with real interview structure</Typography>
                                <Stack spacing={1.3} mt={2.5}>
                                    {[
                                        "Role and job-description context",
                                        "Adaptive technical follow-ups",
                                        "Coding and system-design rounds",
                                        "Feedback you can review and repeat",
                                    ].map((item) => (
                                        <Stack key={item} direction="row" spacing={1} alignItems="flex-start">
                                            <CheckCircleOutlineRounded color="primary" fontSize="small" sx={{ mt: .2 }} />
                                            <Typography color="text.secondary">{item}</Typography>
                                        </Stack>
                                    ))}
                                </Stack>
                            </Paper>
                        </Grid>
                    </Grid>
                </Container>
            </Box>

            <Container maxWidth="md" sx={{ py: { xs: 7, md: 10 } }}>
                <Stack spacing={{ xs: 6, md: 8 }}>
                    {page.sections.map((section) => (
                        <Box component="section" key={section.heading}>
                            <Typography component="h2" variant="h3" fontWeight={900} letterSpacing="-.035em">
                                {section.heading}
                            </Typography>
                            <Typography color="text.secondary" sx={{ mt: 2, fontSize: "1.08rem", lineHeight: 1.85 }}>
                                {section.body}
                            </Typography>
                            <Grid container spacing={1.5} mt={2.5}>
                                {section.points.map((point) => (
                                    <Grid size={{ xs: 12, sm: 6 }} key={point}>
                                        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, height: "100%" }}>
                                            <Stack direction="row" spacing={1.1} alignItems="flex-start">
                                                <CheckCircleOutlineRounded color="primary" fontSize="small" sx={{ mt: .2 }} />
                                                <Typography fontWeight={700}>{point}</Typography>
                                            </Stack>
                                        </Paper>
                                    </Grid>
                                ))}
                            </Grid>
                        </Box>
                    ))}
                </Stack>

                <Divider sx={{ my: { xs: 7, md: 9 } }} />

                <Box component="section" aria-labelledby="faq-heading">
                    <Typography id="faq-heading" component="h2" variant="h3" fontWeight={900} letterSpacing="-.035em">
                        Frequently asked questions
                    </Typography>
                    <Stack spacing={3} mt={4}>
                        {page.faq.map(([question, answer]) => (
                            <Box key={question}>
                                <Typography component="h3" variant="h5" fontWeight={850}>{question}</Typography>
                                <Typography color="text.secondary" sx={{ mt: 1, lineHeight: 1.8 }}>{answer}</Typography>
                            </Box>
                        ))}
                    </Stack>
                </Box>

                <Divider sx={{ my: { xs: 7, md: 9 } }} />

                <Box component="section" aria-labelledby="related-heading">
                    <Typography id="related-heading" component="h2" variant="h4" fontWeight={900}>Related interview practice</Typography>
                    <Grid container spacing={2} mt={2}>
                        {page.related.map((slug) => {
                            const related = searchLandingPageForSlug(slug);
                            if (!related) return null;
                            return (
                                <Grid size={{ xs: 12, md: 4 }} key={slug}>
                                    <Paper
                                        component={RouterLink}
                                        to={related.path}
                                        variant="outlined"
                                        sx={{
                                            p: 2.5,
                                            display: "block",
                                            height: "100%",
                                            borderRadius: 3,
                                            color: "inherit",
                                            textDecoration: "none",
                                            "&:hover": { borderColor: "primary.main" },
                                        }}
                                    >
                                        <Typography fontWeight={850}>{related.title}</Typography>
                                        <Typography variant="body2" color="text.secondary" mt={.75}>{related.description}</Typography>
                                    </Paper>
                                </Grid>
                            );
                        })}
                    </Grid>
                </Box>
            </Container>

            <Box sx={{ bgcolor: "action.hover", py: { xs: 6, md: 8 } }}>
                <Container maxWidth="md">
                    <Stack spacing={2} alignItems="center" textAlign="center">
                        <Typography component="h2" variant="h3" fontWeight={900} letterSpacing="-.035em">
                            Practice the interview before the real interview.
                        </Typography>
                        <Typography color="text.secondary" sx={{ maxWidth: 700, fontSize: "1.05rem", lineHeight: 1.7 }}>
                            Choose your target role, run an adaptive interview, then use the transcript and feedback to repeat the areas that need more depth.
                        </Typography>
                        <Button component="a" href={practiceUrl} variant="contained" size="large" endIcon={<ArrowForwardRounded />}>
                            Start practicing
                        </Button>
                    </Stack>
                </Container>
            </Box>

            <SiteFooter />
        </Box>
    );
}
