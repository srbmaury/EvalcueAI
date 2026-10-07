import PublicSiteFrame from "../components/PublicSiteFrame";
import { Link as RouterLink, Navigate, useLocation } from "react-router-dom";
import { ArrowForwardRounded } from "@mui/icons-material";
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
import { deploymentOrigins, externalSurfaceUrl } from "../utils/deploymentSurface";
import { HIRING_PLAN_SUMMARY, PRACTICE_PLANS } from "../utils/brandEntity";

export default function SearchLandingPage() {
    const { pathname } = useLocation();
    const page = searchLandingPageForPath(pathname);

    if (!page) return <Navigate to="/" replace />;

    const practicePath = `/practice/resources/${page.practiceResource}`;
    const origins = deploymentOrigins();
    const practiceUrl = externalSurfaceUrl("practice", practicePath, {
        ...import.meta.env,
        VITE_PRACTICE_ORIGIN: origins.practice || "https://practice.evalcueai.com",
    });
    const ctaUrl = page.cta?.surface === "hiring"
        ? externalSurfaceUrl("hiring", page.cta.path, {
            ...import.meta.env,
            VITE_HIRING_ORIGIN: origins.hiring || "https://hiring.evalcueai.com",
        })
        : practiceUrl;
    const ctaLabel = page.cta?.label || "Start AI interview practice";
    const editorial = ["/about", "/ai-interview-evaluation-methodology"].includes(pathname);
    const isAbout = page.schema === "AboutPage";
    const isHub = page.schema === "CollectionPage";
    const isWalkthrough = pathname.startsWith("/system-design/");
    // Pricing belongs on product pages only; guides and articles stay free of plan details.
    const showPricing = page.schema === "WebPage";
    const relatedPages = page.related.map(searchLandingPageForSlug).filter(Boolean);

    return (
        <PublicSiteFrame component="article" sx={{ overflow: "hidden" }}>
            <Box sx={(theme) => ({
                py: { xs: 7, md: 11 },
                background: theme.palette.background.paper,
                borderBottom: "1px solid",
                borderColor: theme.palette.divider,
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
                                    EvalcueAI
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
                                {page.audience && !editorial && (
                                    <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 800 }}>
                                        <Box component="span" fontWeight={700} color="text.primary">For: </Box>{page.audience}
                                    </Typography>
                                )}
                                {!editorial && <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} pt={1}>
                                    <Button
                                        component="a"
                                        href={ctaUrl}
                                        variant="contained"
                                        size="large"
                                        endIcon={<ArrowForwardRounded />}
                                    >
                                        {ctaLabel}
                                    </Button>
                                    <Button
                                        component={RouterLink}
                                        to="/docs/candidates/ai-interview-practice"
                                        variant="outlined"
                                        size="large"
                                    >
                                        Read the practice guide
                                    </Button>
                                </Stack>}
                            </Stack>
                        </Grid>
                        {!isAbout && <Grid size={{ xs: 12, md: 4 }}>
                            <Box component="nav" aria-label="Article sections" sx={{ borderLeft: "1px solid", borderColor: "divider", pl: 3, py: 1 }}>
                                <Typography variant="overline">In this guide</Typography>
                                <Stack spacing={2} mt={2}>
                                    {page.sections.map((section, index) => <Typography key={section.heading} component="a" href={`#guide-section-${index}`} sx={{ color: "text.secondary", textDecoration: "none", fontSize: ".9rem", lineHeight: 1.5, "&:hover": { color: "primary.main" } }}>{section.heading}</Typography>)}
                                </Stack>
                            </Box>
                        </Grid>}
                    </Grid>
                </Container>
            </Box>

            <Container maxWidth="md" sx={{ py: { xs: 7, md: 10 } }}>
                {isHub && (
                    <Box component="section" aria-labelledby="collection-heading" sx={{ mb: { xs: 7, md: 9 } }}>
                        <Typography id="collection-heading" component="h2" variant="h4" fontWeight={900}>
                            {pathname === "/system-design" ? "Problems to practice" : "Question sets"}
                        </Typography>
                        <Stack mt={2}>
                            {relatedPages.map((related) => (
                                <Box
                                    key={related.slug}
                                    component={RouterLink}
                                    to={related.path}
                                    sx={{ display: "flex", justifyContent: "space-between", gap: 3, py: 2.5, borderBottom: "1px solid", borderColor: "divider", color: "inherit", textDecoration: "none", "&:hover h3": { color: "primary.main" } }}
                                >
                                    <Box>
                                        <Typography component="h3" variant="h6" fontWeight={800}>{related.title}</Typography>
                                        <Typography variant="body2" color="text.secondary" mt={.5} lineHeight={1.7}>{related.description}</Typography>
                                    </Box>
                                    <ArrowForwardRounded sx={{ fontSize: 20, flexShrink: 0, mt: .5, color: "primary.main" }} />
                                </Box>
                            ))}
                        </Stack>
                    </Box>
                )}
                <Stack spacing={{ xs: 6, md: 8 }}>
                    {page.sections.map((section, index) => (
                        <Box component="section" id={`guide-section-${index}`} key={section.heading} sx={{ scrollMarginTop: 100 }}>
                            {isWalkthrough && <Typography variant="overline" color="primary.main">Step {index + 1}</Typography>}
                            <Typography component="h2" variant={isAbout ? "h4" : "h3"} fontWeight={900} letterSpacing="-.035em">
                                {section.heading}
                            </Typography>
                            <Typography color="text.secondary" sx={{ mt: 2, fontSize: "1.08rem", lineHeight: 1.85 }}>
                                {section.body}
                            </Typography>
                            {section.points?.length > 0 && (
                                <Box component="ul" sx={{ mt: 2, mb: 0, pl: 2.5, color: "text.secondary", "& li": { mb: .75, lineHeight: 1.7 } }}>
                                    {section.points.map((point) => <li key={point}>{point}</li>)}
                                </Box>
                            )}
                            {section.questions?.length > 0 && (
                                <Stack spacing={3} mt={3.5}>
                                    {section.questions.map(([question, answer]) => (
                                        <Box key={question} sx={{ pl: 2, borderLeft: "2px solid", borderColor: "divider" }}>
                                            <Typography component="h3" variant="h6" fontWeight={800} lineHeight={1.4}>{question}</Typography>
                                            <Typography color="text.secondary" sx={{ mt: .75, lineHeight: 1.8 }}>{answer}</Typography>
                                        </Box>
                                    ))}
                                </Stack>
                            )}
                        </Box>
                    ))}
                </Stack>

                {page.example && (
                    <>
                        <Divider sx={{ my: { xs: 7, md: 9 } }} />
                        <Box component="section" aria-labelledby="example-heading">
                            <Typography id="example-heading" component="h2" variant="h3" fontWeight={900} letterSpacing="-.035em">
                                {page.example.heading}
                            </Typography>
                            <Typography color="text.secondary" sx={{ mt: 2, fontSize: "1.05rem", lineHeight: 1.8 }}>{page.example.intro}</Typography>
                            <Stack spacing={1.5} mt={3}>
                                {page.example.turns.map(([speaker, text], index) => (
                                    <Paper
                                        key={index}
                                        variant="outlined"
                                        sx={{
                                            p: 2,
                                            borderRadius: 3,
                                            ml: speaker === "Interviewer" ? 0 : { xs: 2, sm: 6 },
                                            mr: speaker === "Interviewer" ? { xs: 2, sm: 6 } : 0,
                                            bgcolor: speaker === "Interviewer" ? "action.hover" : "background.paper",
                                        }}
                                    >
                                        <Typography variant="overline" color={speaker === "Interviewer" ? "primary.main" : "text.secondary"} fontWeight={800}>{speaker}</Typography>
                                        <Typography sx={{ lineHeight: 1.7 }}>{text}</Typography>
                                    </Paper>
                                ))}
                            </Stack>
                            <Typography component="h3" variant="h6" fontWeight={850} mt={4}>What EvalcueAI evaluates here</Typography>
                            <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2.5, color: "text.secondary", "& li": { mb: .75, lineHeight: 1.7 } }}>
                                {page.example.evaluates.map((item) => <li key={item}>{item}</li>)}
                            </Box>
                        </Box>
                    </>
                )}

                {showPricing && (
                    <>
                        <Divider sx={{ my: { xs: 7, md: 9 } }} />
                        <Box component="section" aria-labelledby="pricing-heading">
                            <Typography id="pricing-heading" component="h2" variant="h3" fontWeight={900} letterSpacing="-.035em">Pricing</Typography>
                            <Grid container spacing={2} mt={2}>
                                {PRACTICE_PLANS.map((plan) => (
                                    <Grid size={{ xs: 12, md: 4 }} key={plan.name}>
                                        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, height: "100%" }}>
                                            <Typography fontWeight={850}>Practice · {plan.name}</Typography>
                                            <Typography variant="body2" color="text.secondary" mt={.75}>{plan.summary}</Typography>
                                        </Paper>
                                    </Grid>
                                ))}
                                <Grid size={{ xs: 12, md: 4 }}>
                                    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, height: "100%" }}>
                                        <Typography fontWeight={850}>Hire</Typography>
                                        <Typography variant="body2" color="text.secondary" mt={.75}>{HIRING_PLAN_SUMMARY}</Typography>
                                    </Paper>
                                </Grid>
                            </Grid>
                        </Box>
                    </>
                )}

                {page.faq.length > 0 && (
                    <>
                        <Divider sx={{ my: { xs: 7, md: 9 } }} />
                        <Box component="section" aria-labelledby="faq-heading">
                            <Typography id="faq-heading" component="h2" variant="h3" fontWeight={900} letterSpacing="-.035em">
                                Common questions
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
                    </>
                )}

                {!isHub && relatedPages.length > 0 && (
                    <>
                        <Divider sx={{ my: { xs: 7, md: 9 } }} />
                        <Box component="section" aria-labelledby="related-heading">
                            <Typography id="related-heading" component="h2" variant="h4" fontWeight={900}>{isAbout ? "Read next" : "Related guides"}</Typography>
                            <Grid container spacing={2} mt={2}>
                                {relatedPages.map((related) => (
                                    <Grid size={{ xs: 12, md: 4 }} key={related.slug}>
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
                                ))}
                            </Grid>
                        </Box>
                    </>
                )}
            </Container>

            <Box sx={{ bgcolor: "action.hover", py: { xs: 6, md: 8 } }}>
                <Container maxWidth="md">
                    <Stack spacing={2} alignItems="center" textAlign="center">
                        <Typography component="h2" variant="h3" fontWeight={900} letterSpacing="-.035em">
                            {editorial ? "Explore EvalcueAI" : page.cta?.surface === "hiring" ? "Build your next technical assessment." : "Put the guide into practice."}
                        </Typography>
                        <Typography color="text.secondary" sx={{ maxWidth: 700, fontSize: "1.05rem", lineHeight: 1.7 }}>
                            {editorial ? "Read the product documentation for workflows, evaluation, and responsible use." : page.cta?.surface === "hiring" ? "Define the role, invite candidates, and review their work with your team." : "Run a focused session, review your answers, and work on the gaps."}
                        </Typography>
                        <Button component="a" href={editorial ? "/docs" : ctaUrl} variant="contained" size="large" endIcon={<ArrowForwardRounded />}>
                            {editorial ? "Read the documentation" : page.cta?.label || "Start practicing"}
                        </Button>
                    </Stack>
                </Container>
            </Box>

            <SiteFooter />
        </PublicSiteFrame>
    );
}
