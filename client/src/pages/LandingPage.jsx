import { useContext } from "react";
import { Link as RouterLink } from "react-router-dom";
import { ArrowForwardRounded } from "@mui/icons-material";
import { Box, Button, Container, Divider, Grid, Link, Stack, Typography } from "@mui/material";
import { AuthContext } from "../context/AuthContext";
import SiteFooter from "../components/SiteFooter";
import PublicSiteFrame from "../components/PublicSiteFrame";
import { setWorkspacePreference } from "../utils/workspacePreference";
import { DEBUGGING_ASSESSMENTS_ENABLED } from "../utils/featureFlags";

const guides = [
    ["01", "Coding interviews", "Practice implementation, explain your approach, and respond to follow-up questions.", "/coding-interview-practice"],
    ["02", "System design", "Work through requirements, architecture, and the trade-offs behind your decisions.", "/system-design-interview-practice"],
    ...(DEBUGGING_ASSESSMENTS_ENABLED ? [["03", "Debugging", "Investigate a failing system and show how you isolate and resolve the problem.", "/debugging-interview-practice"]] : []),
    [DEBUGGING_ASSESSMENTS_ENABLED ? "04" : "03", "Technical discussion", "Go deeper on backend engineering, project experience, and technical judgment.", "/backend-engineer-interview-practice"],
];

export default function LandingPage() {
    const { user } = useContext(AuthContext);
    const destination = (workspace) => workspace === "hiring"
        ? user ? "/hire/assessments" : "/hire/register"
        : user ? "/practice/dashboard" : "/practice/register";
    const remember = (workspace) => setWorkspacePreference(workspace, user?._id);

    return <PublicSiteFrame>
        <Container maxWidth="lg">
            <Grid container spacing={{ xs: 5, md: 8 }} alignItems="center" sx={{ pt: { xs: 7, md: 11 }, pb: { xs: 7, md: 10 } }}>
                <Grid size={{ xs: 12, md: 6 }}>
                    <Typography variant="overline">Technical interviews, with context</Typography>
                    <Typography component="h1" sx={{ mt: 2, maxWidth: 610 }}>Better practice.<br />Clearer hiring evidence.</Typography>
                    <Typography color="text.secondary" sx={{ fontSize: "1.12rem", lineHeight: 1.8, mt: 3, maxWidth: 530 }}>Prepare for software engineering interviews with adaptive AI follow-ups. Build structured assessments that help your team understand how candidates think.</Typography>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} mt={4}>
                        <Button component={RouterLink} to={destination("practice")} onClick={() => remember("practice")} variant="contained" size="large" endIcon={<ArrowForwardRounded />}>{user ? "Open Practice" : "Practice interviews"}</Button>
                        <Button component={RouterLink} to={destination("hiring")} onClick={() => remember("hiring")} variant="outlined" size="large">{user ? "Open Hire" : "Assess candidates"}</Button>
                    </Stack>
                    <Typography variant="body2" color="text.secondary" mt={2}>Free practice plan available. No card required.</Typography>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: "4px", overflow: "hidden" }}>
                        <Stack direction="row" justifyContent="space-between" sx={{ px: 3, py: 2, bgcolor: "action.hover", borderBottom: "1px solid", borderColor: "divider" }}>
                            <Typography variant="body2" fontWeight={600}>System design · Backend engineer</Typography>
                            <Typography variant="caption" color="text.secondary">Example session</Typography>
                        </Stack>
                        <Box sx={{ p: { xs: 2.5, sm: 4 } }}>
                            <Typography variant="overline">Interviewer</Typography>
                            <Typography sx={{ fontSize: "1.15rem", lineHeight: 1.65, mt: 1 }}>How would you prevent duplicate charges when a payment request is retried?</Typography>
                            <Box sx={{ my: 3, pl: 2, borderLeft: "2px solid", borderColor: "divider" }}>
                                <Typography variant="overline">Candidate</Typography>
                                <Typography color="text.secondary" lineHeight={1.75} mt={.5}>I’d use an idempotency key and persist the result, so retries return the original response.</Typography>
                            </Box>
                            <Typography variant="overline">Follow-up</Typography>
                            <Typography lineHeight={1.75} mt={.5}>What happens if two requests with the same key arrive at the same time?</Typography>
                            <Divider sx={{ my: 3 }} />
                            <Typography variant="body2" fontWeight={600}>Review focus</Typography>
                            <Typography variant="body2" color="text.secondary" mt={1} lineHeight={1.7}>Concurrency control, failure recovery, and the trade-offs in your approach.</Typography>
                        </Box>
                    </Box>
                </Grid>
            </Grid>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 1, sm: 4 }} sx={{ py: 2.5, borderTop: "1px solid", borderBottom: "1px solid", borderColor: "divider" }}>
                {[DEBUGGING_ASSESSMENTS_ENABLED ? "Coding, design, debugging & discussion" : "Coding, design & technical discussion", "Follow-ups shaped by your answers", "Hiring decisions reviewed by people"].map((text) => <Typography key={text} variant="body2" color="text.secondary">{text}</Typography>)}
            </Stack>
            <Box component="section" sx={{ py: { xs: 7, md: 10 } }} aria-labelledby="products-heading">
                <Typography variant="overline">Two ways to use EvalcueAI</Typography>
                <Typography component="h2" id="products-heading" mt={1}>Built for both sides of the interview.</Typography>
                <Grid container spacing={{ xs: 5, md: 8 }} mt={4}>
                    {[
                        ["practice", "For engineers", "Prepare with a purpose.", "Bring your resume and target role. Practice a realistic round, review the transcript and feedback, and return to the areas that need work.", ["Role-specific interview rounds", "Resume review and tailored resume tools", "Feedback and progress tracking"], "/practice"],
                        ["hiring", "For hiring teams", "Review the reasoning behind the answer.", "Create a role-specific assessment, invite candidates, and review their work against a shared scorecard before the next interview.", ["Coding, design, and discussion assessments", "Candidate invitations and reports", "Consistent rubrics with human review"], "/hire"],
                    ].map(([workspace, label, title, body, points, path]) => <Grid size={{ xs: 12, md: 6 }} key={workspace}>
                        <Box sx={{ borderTop: "2px solid", borderColor: workspace === "practice" ? "primary.main" : "text.primary", pt: 3 }}>
                            <Typography variant="overline">{label}</Typography>
                            <Typography component="h3" sx={{ mt: 1, fontSize: "1.6rem !important" }}>{title}</Typography>
                            <Typography color="text.secondary" lineHeight={1.8} mt={2}>{body}</Typography>
                            <Box component="ul" sx={{ pl: 2.25, my: 3, color: "text.secondary", "& li": { mb: 1, pl: .5 } }}>{points.map((point) => <li key={point}>{point}</li>)}</Box>
                            <Link component={RouterLink} to={path} underline="hover" sx={{ display: "inline-flex", gap: 1, alignItems: "center", fontWeight: 600 }}>Explore {workspace === "practice" ? "Practice" : "Hire"}<ArrowForwardRounded fontSize="small" /></Link>
                        </Box>
                    </Grid>)}
                </Grid>
            </Box>
        </Container>
        <Box component="section" sx={{ bgcolor: "action.hover", py: { xs: 7, md: 9 } }} aria-labelledby="interview-guides-heading">
            <Container maxWidth="lg">
                <Grid container spacing={5}>
                    <Grid size={{ xs: 12, md: 4 }}>
                        <Typography variant="overline">Interview guides</Typography>
                        <Typography component="h2" id="interview-guides-heading" mt={1}>Start with the round ahead of you.</Typography>
                        <Typography color="text.secondary" lineHeight={1.8} mt={2}>Understand what a round tests and how to prepare for it.</Typography>
                        <Link component={RouterLink} to="/interview-questions" underline="hover" sx={{ display: "inline-block", mt: 3 }}>Browse interview questions →</Link>
                    </Grid>
                    <Grid size={{ xs: 12, md: 8 }}>
                        {guides.map(([number, title, body, path]) => <Box component={RouterLink} to={path} key={path} sx={{ display: "grid", gridTemplateColumns: "32px 1fr 24px", gap: 2, py: 3, borderBottom: "1px solid", borderColor: "divider", color: "inherit", textDecoration: "none", "&:first-of-type": { pt: 0 }, "&:hover h3": { color: "primary.main" } }}>
                            <Typography variant="caption" color="text.secondary" pt={.5}>{number}</Typography>
                            <Box><Typography component="h3">{title}</Typography><Typography color="text.secondary" lineHeight={1.7} mt={.75}>{body}</Typography></Box>
                            <ArrowForwardRounded sx={{ fontSize: 20, mt: .5 }} />
                        </Box>)}
                    </Grid>
                </Grid>
            </Container>
        </Box>
        <Container maxWidth="lg" sx={{ py: { xs: 6, md: 8 } }}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={3} justifyContent="space-between" alignItems={{ md: "center" }}>
                <Box><Typography component="h2">Understand how the platform works.</Typography><Typography color="text.secondary" mt={1}>Read our evaluation approach and practical product guides.</Typography></Box>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                    <Button component={RouterLink} to="/ai-interview-evaluation-methodology" variant="outlined">Evaluation methodology</Button>
                    <Button component={RouterLink} to="/docs" variant="text" endIcon={<ArrowForwardRounded />}>Documentation</Button>
                </Stack>
            </Stack>
        </Container>
        <SiteFooter />
    </PublicSiteFrame>;
}
