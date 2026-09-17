import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../api/axios";
import { AuthContext } from "../context/AuthContext";
import { trackEvent } from "../utils/analytics";
import { canonicalProductPath } from "../utils/productRoutes";

import { Add, ArrowForward, CheckCircleOutline, InsightsOutlined, PlayCircleOutline, RadioButtonUnchecked, TrackChanges } from "@mui/icons-material";
import { Alert, Box, Button, Card, CardActionArea, CardContent, Chip, Container, Grid, LinearProgress, Pagination, Skeleton, Stack, Typography, ToggleButton, ToggleButtonGroup } from "@mui/material";

const formatUsagePeriod = (period) => {
    const match = /^(\d{4})-(\d{2})$/.exec(period || "");
    if (!match) return period || "this month";
    const [, year, month] = match;
    return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" })
        .format(new Date(Date.UTC(Number(year), Number(month) - 1, 1)));
};

const DashboardPage = () => {
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();
    const [interviews, setInterviews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [limit] = useState(10);
    const [totalPages, setTotalPages] = useState(1);
    const [totalInterviews, setTotalInterviews] = useState(0);
    const [statusFilter, setStatusFilter] = useState("all");
    const [error, setError] = useState("");
    const [progress, setProgress] = useState({ averageScore: 0, improvement: 0, completed: 0 });
    const [recommendations, setRecommendations] = useState([]);
    const [entitlements, setEntitlements] = useState(null);
    const [resumeCount, setResumeCount] = useState(0);

    useEffect(() => {
        if (!user?._id) return;
        trackEvent("dashboard_viewed");
        api.get("/interviews/analytics/progress").then(({ data }) => setProgress(data || {})).catch(() => {});
        api.get("/recommendations").then(({ data }) => setRecommendations(data?.actions || [])).catch(() => {});
        api.get("/billing/practice/entitlements").then(({ data }) => setEntitlements(data || null)).catch(() => {});
        api.get("/resumes", { params: { page: 1, limit: 1 } }).then(({ data }) => setResumeCount(Array.isArray(data) ? data.length : Number(data?.total) || 0)).catch(() => {});
    }, [user]);

    const previousStatusFilterRef = useRef(statusFilter);

    useEffect(() => {
        if (!user?._id) return undefined;
        // Changing the filter while on page > 1 must reset to page 1 and fetch exactly
        // once for the new filter — not fire a stale-page fetch for the old page/new
        // filter combination and then immediately a second fetch for page 1.
        const filterChanged = previousStatusFilterRef.current !== statusFilter;
        previousStatusFilterRef.current = statusFilter;
        if (filterChanged && page !== 1) { setPage(1); return undefined; }

        let active = true;
        const fetchInterviews = async () => {
            setLoading(true);
            setError("");
            try {
                const params = { page, limit };
                if (statusFilter !== "all") params.status = statusFilter;
                const { data } = await api.get("/interviews", { params });
                if (!active) return;
                if (Array.isArray(data)) {
                    setInterviews(data);
                    setTotalPages(1);
                    setTotalInterviews(data.length);
                } else {
                    setInterviews(Array.isArray(data?.items) ? data.items : []);
                    setTotalPages(Number(data?.totalPages) || 1);
                    setTotalInterviews(Number(data?.total) || 0);
                }
            } catch (err) {
                if (!active) return;
                console.error(err);
                setInterviews([]);
                setTotalPages(1);
                setTotalInterviews(0);
                setError("We couldn't load your practice history. Please refresh and try again.");
            } finally {
                if (active) setLoading(false);
            }
        };
        fetchInterviews();
        return () => { active = false; };
    }, [user, page, limit, statusFilter]);

    const completedCount = interviews.filter((item) => item.isCompleted).length;
    const firstName = user?.name?.trim()?.split(/\s+/)[0] || "there";
    const activeInterview = useMemo(() => interviews.find((item) => !item.isCompleted) || null, [interviews]);
    const nextAction = useMemo(() => {
        if (activeInterview?._id) return {
            eyebrow: "Continue where you left off",
            title: activeInterview.jobRole || "Practice interview",
            body: "Your interview is saved. Continue from the exact round you were working on.",
            label: "Continue interview",
            href: `/practice/interviews/${activeInterview._id}`,
        };
        if (!user?.targetRole) return {
            eyebrow: "Personalize your practice",
            title: "Set the role you’re targeting",
            body: "Your target role helps Evalcue AI choose more relevant interview plans and recommendations.",
            label: "Set target role",
            href: "/practice/profile#target-role",
        };
        if (resumeCount === 0) return {
            eyebrow: "Make practice more realistic",
            title: "Add the résumé you plan to use",
            body: "Use your real experience to ground interview questions and feedback.",
            label: "Add résumé",
            href: "/practice/resumes",
        };
        return {
            eyebrow: Number(progress.completed || 0) > 0 ? "Recommended next step" : "Start your first practice loop",
            title: Number(progress.completed || 0) > 0 ? `Practice ${user.targetRole} again` : `Start a ${user.targetRole} interview`,
            body: Number(progress.completed || 0) > 0 ? "Repetition is most useful when you apply the feedback from your last session." : "Build a short role-specific interview plan and get structured feedback when you finish.",
            label: "Start new practice",
            href: "/practice/new",
        };
    }, [activeInterview, progress.completed, resumeCount, user?.targetRole]);

    const filteredInterviews = interviews.filter((interview) => (
        statusFilter === "all"
            ? true
            : statusFilter === "completed"
                ? Boolean(interview.isCompleted)
                : !interview.isCompleted
    ));

    return (
        <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
            <Box mb={3}>
                <Typography variant="overline" color="primary.main" fontWeight={800}>Evalcue AI Practice</Typography>
                <Typography component="h1" variant="h3" sx={{ fontSize: { xs: "2.35rem", sm: "3rem" } }} fontWeight={800} letterSpacing="-.035em">Welcome back, {firstName}</Typography>
                <Typography color="text.secondary" mt={1}>One focused next step, then everything else when you need it.</Typography>
            </Box>

            {!loading && <Card variant="outlined" sx={{ mb: 4, borderColor: "primary.light", overflow: "hidden" }}>
                <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
                    <Grid container spacing={3} alignItems="center">
                        <Grid size={{ xs: 12, md: 8 }}>
                            <Typography variant="overline" color="primary.main" fontWeight={850}>{nextAction.eyebrow}</Typography>
                            <Typography component="h2" variant="h4" fontWeight={850} letterSpacing="-.025em" mt={.25}>{nextAction.title}</Typography>
                            <Typography color="text.secondary" mt={1} maxWidth={650}>{nextAction.body}</Typography>
                            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} mt={2.5}>
                                <Button variant="contained" size="large" startIcon={<PlayCircleOutline />} onClick={() => navigate(nextAction.href)}>{nextAction.label}</Button>
                                {activeInterview && <Button variant="outlined" size="large" startIcon={<Add />} onClick={() => navigate("/practice/new")}>Start something new</Button>}
                                <Button variant="text" size="large" startIcon={<InsightsOutlined />} onClick={() => navigate("/practice/progress")}>View progress</Button>
                            </Stack>
                        </Grid>
                        <Grid size={{ xs: 12, md: 4 }}>
                            <Stack spacing={1.25} sx={{ p: 2, borderRadius: 3, bgcolor: "action.hover" }}>
                                <Stack direction="row" justifyContent="space-between"><Typography variant="body2" color="text.secondary">Target role</Typography><Typography variant="body2" fontWeight={750}>{user?.targetRole || "Not set"}</Typography></Stack>
                                <Stack direction="row" justifyContent="space-between"><Typography variant="body2" color="text.secondary">Completed</Typography><Typography variant="body2" fontWeight={750}>{progress.completed || completedCount}</Typography></Stack>
                                <Stack direction="row" justifyContent="space-between"><Typography variant="body2" color="text.secondary">Average score</Typography><Typography variant="body2" fontWeight={750}>{progress.averageScore ? `${progress.averageScore}/10` : "—"}</Typography></Stack>
                                <Stack direction="row" justifyContent="space-between"><Typography variant="body2" color="text.secondary">Résumés</Typography><Typography variant="body2" fontWeight={750}>{resumeCount}</Typography></Stack>
                            </Stack>
                        </Grid>
                    </Grid>
                </CardContent>
            </Card>}

            {!loading && Number(progress.completed || 0) === 0 && <Card variant="outlined" sx={{ mb: 4 }}><CardContent sx={{ p: { xs: 2.5, md: 3 } }}><Typography variant="h6" fontWeight={800}>Your first practice loop</Typography><Typography color="text.secondary" mt={.5} mb={2}>You don’t need to configure everything before you begin.</Typography><Stack spacing={1.1}>{[
                { done: Boolean(user?.targetRole), label: "Set your target role", action: "Set goal", href: "/practice/profile#target-role" },
                { done: resumeCount > 0, label: "Add your résumé", action: "Add résumé", href: "/practice/resumes" },
                { done: totalInterviews > 0, label: "Create a tailored interview", action: "Create interview", href: "/practice/new" },
                { done: Number(progress.completed || 0) > 0, label: "Finish one round and review feedback", action: "Continue", href: activeInterview?._id ? `/practice/interviews/${activeInterview._id}` : "/practice/new" },
            ].map((step) => <Stack key={step.label} direction="row" alignItems="center" spacing={1.5} sx={{ p: 1.15, borderRadius: 2, bgcolor: step.done ? "action.hover" : "transparent" }}>{step.done ? <CheckCircleOutline color="success" /> : <RadioButtonUnchecked color="disabled" />}<Typography flex={1} fontWeight={step.done ? 500 : 700} color={step.done ? "text.secondary" : "text.primary"}>{step.label}</Typography>{!step.done && <Button size="small" onClick={() => navigate(step.href)}>{step.action}</Button>}</Stack>)}</Stack></CardContent></Card>}

            {recommendations.length > 0 && <Box mb={4}><Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} mb={2}><Box><Typography component="h2" variant="h5" fontWeight={750}>More ways to improve</Typography><Typography variant="body2" color="text.secondary">Optional recommendations after your primary next step.</Typography></Box></Stack><Grid container spacing={2}>{recommendations.slice(0, 3).map((item) => <Grid size={{ xs: 12, md: 4 }} key={item.id}><Card variant="outlined" sx={{ height: "100%" }}><CardActionArea onClick={() => navigate(canonicalProductPath(item.href || "/practice/dashboard"))} sx={{ height: "100%" }}><CardContent><Typography component="h3" variant="h6" fontWeight={750}>{item.title}</Typography><Typography variant="body2" color="text.secondary" mt={1}>{item.reason || "Based on your saved goal and latest practice."}</Typography><ArrowForward color="primary" sx={{ mt: 2 }} /></CardContent></CardActionArea></Card></Grid>)}</Grid></Box>}

            {entitlements && <Alert severity={entitlements.plan === "pro" ? "success" : "info"} sx={{ mb: 3 }} action={<Button color="inherit" size="small" onClick={() => navigate("/practice/pricing")}>{entitlements.plan === "free" ? "View Pro" : "Manage"}</Button>}>
                <strong>{entitlements.plan === "pro" ? "Practice Pro" : "Practice Free"}:</strong> {entitlements.used.interviews} of {entitlements.limits.interviews} practice interviews, {entitlements.used.resumeReviews} of {entitlements.limits.resumeReviews} resume reviews{entitlements.used.resumeGenerations !== undefined && entitlements.limits.resumeGenerations !== undefined && `, and ${entitlements.used.resumeGenerations} of ${entitlements.limits.resumeGenerations} tailored resume generations`} used in {formatUsagePeriod(entitlements.period)}.
            </Alert>}

            <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "stretch", sm: "center" }} spacing={2} mb={2}>
                <Box><Typography component="h2" variant="h5" fontWeight={750}>Practice history</Typography><Typography variant="body2" color="text.secondary">Continue unfinished sessions or revisit completed feedback.</Typography></Box>
                {!loading && <ToggleButtonGroup value={statusFilter} exclusive onChange={(_, value) => setStatusFilter(value || "all")} size="small" color="primary" aria-label="Filter interviews on this page"><ToggleButton value="all">All</ToggleButton><ToggleButton value="in_progress">In progress</ToggleButton><ToggleButton value="completed">Completed</ToggleButton></ToggleButtonGroup>}
            </Stack>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            {loading ? <Stack spacing={2}>{Array.from({ length: 4 }).map((_, index) => <Card key={index} variant="outlined"><CardContent><Skeleton variant="text" width="40%" height={28} /><Skeleton variant="text" width="25%" height={20} sx={{ mt: .5 }} /><Skeleton variant="rounded" width={80} height={24} sx={{ mt: 1 }} /></CardContent></Card>)}</Stack> : interviews.length === 0 ? (
                statusFilter === "all" ? <Card variant="outlined" sx={{ borderStyle: "dashed" }}><Stack spacing={2} alignItems="center" textAlign="center" sx={{ py: 7, px: 2 }}><Box sx={{ width: 56, height: 56, display: "grid", placeItems: "center", borderRadius: "50%", bgcolor: "action.hover", color: "primary.main" }}><TrackChanges /></Box><Typography variant="h6" fontWeight={750}>No practice sessions yet</Typography><Typography color="text.secondary" maxWidth={460}>Start with the role you’re targeting. You can refine the plan before the interview begins.</Typography><Button variant="contained" startIcon={<Add />} onClick={() => navigate("/practice/new")}>Start practice</Button></Stack></Card>
                    : <Card variant="outlined" sx={{ borderStyle: "dashed" }}><Stack spacing={2} alignItems="center" textAlign="center" sx={{ py: 5, px: 2 }}><Typography variant="h6" fontWeight={750}>No {statusFilter === "completed" ? "completed" : "in-progress"} practice sessions</Typography><Typography color="text.secondary">Try another history filter to see your other sessions.</Typography><Button variant="outlined" onClick={() => setStatusFilter("all")}>Show all sessions</Button></Stack></Card>
            ) : <Stack spacing={2}>{filteredInterviews.length === 0 ? <Typography color="text.secondary" sx={{ py: 2 }}>No {statusFilter === "completed" ? "completed" : "in-progress"} interviews yet.</Typography> : filteredInterviews.map((interview) => <Card key={interview._id} variant="outlined" sx={{ transition: "transform .18s ease, box-shadow .18s ease", "&:hover": { transform: "translateY(-2px)", boxShadow: 3 } }}><CardActionArea onClick={() => navigate(`/practice/interviews/${interview._id}`)}><CardContent><Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2}><Box><Typography variant="h6" fontWeight={750}>{interview.jobRole}</Typography><Typography color="text.secondary">{interview.company} · {new Date(interview.createdAt).toLocaleDateString()}</Typography></Box><Stack direction="row" alignItems="center" gap={.5}><Typography variant="body2" fontWeight={700} color="primary.main">{interview.isCompleted ? "Review feedback" : "Continue"}</Typography><ArrowForward color="primary" /></Stack></Stack><Stack direction="row" spacing={1} mt={2.5} mb={1.5} alignItems="center"><Chip size="small" label={interview.isCompleted ? "Completed" : "In progress"} color={interview.isCompleted ? "success" : "warning"} />{Number.isFinite(Number(interview.roundsCompleted)) && Number.isFinite(Number(interview.roundsTotal)) && <Typography variant="caption" color="text.secondary">Rounds: {interview.roundsCompleted}/{interview.roundsTotal}</Typography>}</Stack>{Number(interview.roundsTotal) > 0 && <LinearProgress variant="determinate" value={Math.min(100, (Number(interview.roundsCompleted) / Number(interview.roundsTotal)) * 100)} sx={{ height: 6, borderRadius: 99 }} />}</CardContent></CardActionArea></Card>)}</Stack>}

            {totalPages > 1 && <Box sx={{ mt: 3, display: "flex", justifyContent: "center" }}><Pagination color="primary" page={page} count={totalPages} onChange={(_, nextPage) => setPage(nextPage)} /></Box>}
        </Container>
    );
};

export default DashboardPage;
