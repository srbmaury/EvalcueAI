import { useCallback, useContext, useEffect, useState } from "react";
import { Link as RouterLink, Navigate, useLocation } from "react-router-dom";
import { AddRounded, AssignmentTurnedInRounded, ContentCopyRounded, GroupsRounded, HourglassTopRounded, InsightsRounded } from "@mui/icons-material";
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Container, Divider, Grid, IconButton, MenuItem, Pagination, Paper, Stack, TextField, Tooltip, Typography } from "@mui/material";
import api from "../api/axios";
import { useNotify } from "../context/NotificationContext";
import { OrganizationContext } from "../context/OrganizationContext";
import { hiringPermissionsFor } from "../utils/hiringPermissions";
import { absoluteSurfaceUrl } from "../utils/deploymentSurface";

const createAssessmentPath = "/hire/assessments?create=1";

export default function AssessmentsPage() {
    const location = useLocation();
    const notify = useNotify();
    const { currentRole, activeOrganization, loading: organizationLoading } = useContext(OrganizationContext);
    const {
        canViewOverview: canViewHiringOverview,
        canViewCandidatePipeline,
        canViewAssessments,
        canManageAssessments,
    } = hiringPermissionsFor(currentRole);
    const [items, setItems] = useState([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [overview, setOverview] = useState({ summary: {}, assessments: [], candidates: [], totalPages: 1 });
    const [candidatePage, setCandidatePage] = useState(1);
    const [candidateSearch, setCandidateSearch] = useState("");
    const [candidateStatus, setCandidateStatus] = useState("");
    const [candidateAssessment, setCandidateAssessment] = useState("");
    const [overviewLoading, setOverviewLoading] = useState(true);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        if (!activeOrganization?._id || !canViewAssessments) {
            setItems([]);
            setTotalPages(1);
            setLoading(false);
            return;
        }
        setLoading(true);
        setError("");
        try {
            const { data } = await api.get("/assessments", { params: { page, limit: 8 } });
            setItems(data.items || []);
            setTotalPages(data.totalPages || 1);
        } catch {
            setError("We couldn’t load your assessments.");
        } finally {
            setLoading(false);
        }
    }, [activeOrganization?._id, canViewAssessments, page]);

    const loadOverview = useCallback(async () => {
        if (!activeOrganization?._id || !canViewCandidatePipeline) {
            setOverview({ summary: {}, assessments: [], candidates: [], totalPages: 1 });
            setOverviewLoading(false);
            return;
        }
        setOverviewLoading(true);
        try {
            const { data } = await api.get("/assessments/overview", {
                params: {
                    page: candidatePage,
                    limit: 8,
                    search: candidateSearch || undefined,
                    status: candidateStatus || undefined,
                    assessmentId: candidateAssessment || undefined,
                },
            });
            setOverview({
                summary: data.summary || {},
                assessments: data.assessments || [],
                candidates: data.candidates || [],
                totalPages: data.totalPages || 1,
            });
        } catch {
            setError("We couldn’t load the candidate pipeline.");
        } finally {
            setOverviewLoading(false);
        }
    }, [activeOrganization?._id, canViewCandidatePipeline, candidatePage, candidateSearch, candidateStatus, candidateAssessment]);

    useEffect(() => {
        setItems([]);
        setPage(1);
        setTotalPages(1);
        setOverview({ summary: {}, assessments: [], candidates: [], totalPages: 1 });
        setCandidatePage(1);
        setCandidateSearch("");
        setCandidateStatus("");
        setCandidateAssessment("");
        setError("");
    }, [activeOrganization?._id]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        const timer = setTimeout(loadOverview, candidateSearch ? 300 : 0);
        return () => clearTimeout(timer);
    }, [loadOverview, candidateSearch]);
    useEffect(() => {
        if (!location.hash) return;
        const id = location.hash.slice(1);
        const timer = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
        return () => window.clearTimeout(timer);
    }, [location.hash, loading, overviewLoading]);

    const requestedHiringView = location.hash === "#candidate-pipeline"
        ? "candidates"
        : location.hash === "#assessment-list"
            ? "assessments"
            : "overview";
    const hiringView = requestedHiringView === "overview" && !canViewHiringOverview
        ? "candidates"
        : requestedHiringView === "assessments" && !canViewAssessments
            ? "candidates"
            : requestedHiringView;

    const viewHeading = {
        overview: ["Hiring workspace", "Review the hiring pipeline, assessments, and candidate evidence without switching contexts."],
        candidates: ["Candidates", "Every candidate across your assessments, ordered by their latest activity."],
        assessments: ["Assessment library", "Draft, publish, and manage the assessments candidates take."],
    }[hiringView];

    const copyLink = async (token) => {
        try {
            await navigator.clipboard.writeText(absoluteSurfaceUrl("practice", `/assessment/${token}`));
            notify("Candidate link copied.", "success");
        } catch {
            notify("Candidate link could not be copied.", "error");
        }
    };

    if (organizationLoading) return <Stack minHeight="50vh" alignItems="center" justifyContent="center"><CircularProgress /></Stack>;
    if (!activeOrganization) return <Navigate to="/hire/team" replace />;

    return <Container maxWidth="lg" sx={{ py: { xs: 3, md: 6 } }}>
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "stretch", sm: "flex-start" }} gap={2} mb={3}>
            <Box>
                <Typography component="h1" variant="h3" sx={{ fontSize: { xs: "2.45rem", sm: "3rem" } }} fontWeight={850}>{viewHeading[0]}</Typography>
                <Typography color="text.secondary" sx={{ mt: 1 }}>{viewHeading[1]}</Typography>
            </Box>
            {canManageAssessments && <Button component={RouterLink} to={createAssessmentPath} variant="contained" startIcon={<AddRounded />}>Create assessment</Button>}
        </Stack>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {canViewHiringOverview && hiringView === "overview" && <>
            <Typography component="h2" variant="h5" fontWeight={800} mb={2}>Overview</Typography>
            <Grid container spacing={2} mb={4}>{[
                [<AssignmentTurnedInRounded key="i" />, "Published assessments", overview.summary.activeAssessments ?? "—", `${overview.summary.assessments ?? 0} total`],
                [<GroupsRounded key="i" />, "Candidates", overview.summary.totalCandidates ?? "—", `${overview.summary.submitted ?? 0} submitted`],
                [<HourglassTopRounded key="i" />, "In progress", overview.summary.inProgress ?? "—", "May need a reminder"],
                [<InsightsRounded key="i" />, "Average AI score", overview.summary.averageScore == null ? "—" : `${overview.summary.averageScore}/10`, "Review with human judgment"],
            ].map(([icon, label, value, help]) => <Grid size={{ xs: 6, md: 3 }} key={label}>
                <Paper variant="outlined" sx={{ p: 2.25, height: "100%" }}>
                    <Box color="primary.main" mb={1}>{icon}</Box>
                    <Typography variant="h5" fontWeight={850}>{value}</Typography>
                    <Typography fontWeight={750}>{label}</Typography>
                    <Typography variant="caption" color="text.secondary">{help}</Typography>
                </Paper>
            </Grid>)}</Grid>
            {(overview.summary.invitations || overview.summary.invitationFailed) > 0 && <Paper variant="outlined" sx={{ p: 2.5, mb: 4 }}>
                <Typography component="h2" variant="h6" fontWeight={800}>Invitation funnel</Typography>
                <Stack direction={{ xs: "column", sm: "row" }} gap={2} mt={1.5}>{[
                    ["Invited", overview.summary.invitations || 0],
                    ["Opened", overview.summary.invitationOpened || 0],
                    ["Started", overview.summary.totalCandidates || 0],
                    ["Submitted", overview.summary.submitted || 0],
                    ["Delivery issues", overview.summary.invitationFailed || 0],
                ].map(([label, value]) => <Box key={label} flex={1}>
                    <Typography variant="h5" fontWeight={850} color={label === "Delivery issues" && value ? "error.main" : "text.primary"}>{value}</Typography>
                    <Typography variant="body2" color="text.secondary">{label}</Typography>
                </Box>)}</Stack>
            </Paper>}
        </>}

        {canViewCandidatePipeline && hiringView !== "assessments" && <Paper id="candidate-pipeline" variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, mb: 4, scrollMarginTop: 100 }}>
            <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "stretch", md: "center" }} gap={2} mb={2}>
                <Box>
                    <Typography component="h2" variant="h5" fontWeight={800}>Candidate pipeline</Typography>
                    <Typography variant="body2" color="text.secondary">Candidates across all assessments, ordered by their latest activity.</Typography>
                </Box>
                <Stack direction={{ xs: "column", sm: "row" }} gap={1.5} flexWrap="wrap">
                    <TextField size="small" label="Search name or email" value={candidateSearch} onChange={(event) => { setCandidateSearch(event.target.value); setCandidatePage(1); }} />
                    <TextField select size="small" label="Assessment" value={candidateAssessment} onChange={(event) => { setCandidateAssessment(event.target.value); setCandidatePage(1); }} sx={{ minWidth: 180 }}>
                        <MenuItem value="">All assessments</MenuItem>
                        {overview.assessments.map((assessment) => <MenuItem key={assessment._id} value={assessment._id}>{assessment.title}</MenuItem>)}
                    </TextField>
                    <TextField select size="small" label="Status" value={candidateStatus} onChange={(event) => { setCandidateStatus(event.target.value); setCandidatePage(1); }} sx={{ minWidth: 150 }}>
                        <MenuItem value="">All candidates</MenuItem>
                        <MenuItem value="started">In progress</MenuItem>
                        <MenuItem value="evaluating">Evaluating</MenuItem>
                        <MenuItem value="evaluation_failed">Needs retry</MenuItem>
                        <MenuItem value="submitted">Submitted</MenuItem>
                    </TextField>
                    {(candidateSearch || candidateStatus || candidateAssessment) && <Button type="button" size="small" color="inherit" onClick={() => { setCandidateSearch(""); setCandidateStatus(""); setCandidateAssessment(""); setCandidatePage(1); }}>Clear filters</Button>}
                </Stack>
            </Stack>
            {overviewLoading ? <Stack alignItems="center" py={3}><CircularProgress size={28} /></Stack> : overview.candidates?.length ? <Stack divider={<Divider flexItem />}>
                {overview.candidates.map((candidate) => {
                    const statusLabel = candidate.status === "submitted"
                        ? "Submitted"
                        : candidate.status === "evaluating"
                            ? "Evaluating"
                            : candidate.status === "evaluation_failed"
                                ? "Needs retry"
                                : "In progress";
                    return <Stack key={candidate._id} direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "stretch", md: "center" }} gap={1.5} py={1.75}>
                        <Box minWidth={0}>
                            <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                                <Typography fontWeight={800} sx={{ overflowWrap: "anywhere" }}>{candidate.candidateName}</Typography>
                                <Chip size="small" label={statusLabel} color={candidate.status === "submitted" ? "success" : candidate.status === "evaluation_failed" ? "error" : "warning"} />
                            </Stack>
                            <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>{candidate.candidateEmail}</Typography>
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography fontWeight={700} sx={{ overflowWrap: "anywhere" }}>{candidate.assessment?.title || "Assessment"}</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>{candidate.assessment?.jobRole}{candidate.assessment?.company ? ` · ${candidate.assessment.company}` : ""}</Typography>
                        </Box>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2} flexWrap="wrap">
                            <Box textAlign={{ md: "right" }}>
                                <Typography fontWeight={800}>{candidate.overallScore == null ? "—" : `${candidate.overallScore}/10`}</Typography>
                                <Typography variant="caption" color="text.secondary">{candidate.submittedAt ? `Submitted ${new Date(candidate.submittedAt).toLocaleDateString()}` : `Started ${new Date(candidate.startedAt).toLocaleDateString()}`}</Typography>
                            </Box>
                            {candidate.assessment?._id && <Button component={RouterLink} to={`/hire/assessments/${candidate.assessment._id}`} size="small" variant="outlined">Review</Button>}
                        </Stack>
                    </Stack>;
                })}
            </Stack> : <Alert severity="info">{candidateSearch || candidateStatus || candidateAssessment ? "No candidates match these filters." : "Candidate activity will appear here after someone opens an assessment link and starts."}</Alert>}
            {(overview.totalPages || 1) > 1 && <Stack alignItems="center" mt={2}><Pagination page={candidatePage} count={overview.totalPages} onChange={(_, value) => setCandidatePage(value)} /></Stack>}
        </Paper>}

        {canViewAssessments && hiringView !== "candidates" && <>
            <Typography id="assessment-list" component="h2" variant="h5" fontWeight={800} mb={2} sx={{ scrollMarginTop: 100 }}>Assessments</Typography>
            {loading ? <Stack alignItems="center" py={4}><CircularProgress /></Stack> : items.length === 0 ? <Alert severity="info" sx={{ mb: 3 }} action={canManageAssessments ? <Button component={RouterLink} to={createAssessmentPath} color="inherit">Create one</Button> : null}>No assessments yet.</Alert> : <Stack spacing={2} mb={4}>{items.map((item) => {
                const inProgress = Math.max((item.attemptCount || 0) - (item.submittedCount || 0), 0);
                const completion = item.attemptCount ? Math.round((item.submittedCount || 0) / item.attemptCount * 100) : 0;
                return <Card variant="outlined" key={item._id} sx={{ borderRadius: 3 }}>
                    <CardContent sx={{ p: { xs: 2.25, sm: 2.5 }, "&:last-child": { pb: { xs: 2.25, sm: 2.5 } } }}>
                        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={2.5}>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                                    <Typography component="h3" variant="h6" fontWeight={800}>{item.title}</Typography>
                                    <Chip size="small" label={item.status === "active" ? "published" : item.status} color={item.status === "active" ? "success" : ["draft", "scheduled"].includes(item.status) ? "warning" : "default"} />
                                    {item.opensAt && item.status === "scheduled" && <Chip size="small" variant="outlined" label={`Opens ${new Date(item.opensAt).toLocaleString()}`} />}
                                    {item.expiresAt && <Chip size="small" variant="outlined" label={`Due ${new Date(item.expiresAt).toLocaleDateString()}`} />}
                                </Stack>
                                <Typography color="text.secondary">{item.jobRole}{item.company ? ` · ${item.company}` : ""}</Typography>
                                <Typography variant="body2" mt={1}>{item.status === "draft" ? "Not visible to candidates" : item.status === "scheduled" ? `Invitations will be delivered at opening · ${item.timezone || "UTC"}` : `${item.submittedCount || 0} submitted · ${inProgress} in progress · ${completion}% completion`}</Typography>
                            </Box>
                            <Stack direction="row" alignItems="center" spacing={.75} flexShrink={0}>
                                {canManageAssessments && item.status === "active" && <Tooltip title="Copy candidate link"><IconButton onClick={() => copyLink(item.shareToken)}><ContentCopyRounded /></IconButton></Tooltip>}
                                <Button component={RouterLink} to={`/hire/assessments/${item._id}`} variant="outlined">{canManageAssessments ? (item.status === "draft" ? "Review draft" : "Manage assessment") : "View assessment"}</Button>
                            </Stack>
                        </Stack>
                    </CardContent>
                </Card>;
            })}</Stack>}
            {totalPages > 1 && <Stack alignItems="center" sx={{ mb: 4 }}><Pagination page={page} count={totalPages} onChange={(_, value) => setPage(value)} /></Stack>}
        </>}
    </Container>;
}
