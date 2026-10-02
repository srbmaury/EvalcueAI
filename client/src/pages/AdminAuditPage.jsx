import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Chip, Collapse, Container, Grid, MenuItem, Pagination, Skeleton, Stack, TextField, Typography } from "@mui/material";
import api from "../api/axios";
import { Link as RouterLink } from "react-router-dom";

const actionLabels = {
    "auth.login": "Signed in",
    "auth.logout": "Signed out",
    "auth.forgot": "Requested password reset",
    "auth.reset": "Reset password",
    "assessment.create": "Created assessment",
    "assessment.duplicate": "Created assessment version",
    "assessment.invite": "Invited candidates",
    "assessment.invitation.revoke": "Revoked invitation",
    "assessment.review": "Reviewed candidate",
    "assessment.status_update": "Changed assessment status",
    "assessment.update": "Updated assessment",
    "interview.create": "Created practice interview",
    "product_feedback.status_update": "Changed feedback status",
    "resume.upload": "Uploaded resume",
    "resume.update": "Updated resume",
    "resume.delete": "Deleted resume",
    "resume.review": "Reviewed resume",
};

const formatMetadata = (metadata) => Object.entries(metadata || {}).filter(([, value]) => value !== undefined).map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value)}`).join(" · ");

export default function AdminAuditPage() {
    const [items, setItems] = useState([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [queryInput, setQueryInput] = useState("");
    const [query, setQuery] = useState("");
    const [outcome, setOutcome] = useState("");
    const [entityType, setEntityType] = useState("");
    const [expanded, setExpanded] = useState("");

    useEffect(() => {
        const timer = setTimeout(() => { setQuery(queryInput.trim()); setPage(1); }, 350);
        return () => clearTimeout(timer);
    }, [queryInput]);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            setError("");
            const { data } = await api.get("/admin/audit", { params: { page, limit: 25, q: query || undefined, outcome: outcome || undefined, entityType: entityType || undefined } });
            setItems(data.items || []);
            setTotal(Number(data.total) || 0);
            setTotalPages(Math.max(Number(data.totalPages) || 1, 1));
        } catch (requestError) {
            setError(requestError?.response?.status === 403 ? "Administrator access is required." : "Audit activity could not be loaded.");
        } finally {
            setLoading(false);
        }
    }, [entityType, outcome, page, query]);

    useEffect(() => { load(); }, [load]);

    return <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} gap={1}><Box><Typography variant="overline" color="primary.main" fontWeight={850}>Admin</Typography><Typography component="h1" variant="h3" fontWeight={850}>Audit activity</Typography></Box><Button component={RouterLink} to="/admin/feedback" variant="outlined">View feedback inbox</Button></Stack>
        <Typography color="text.secondary" mt={1}>Trace security-sensitive and operational changes. Logs are retained for the configured audit retention period and are visible only to administrators.</Typography>

        <Grid container spacing={2} my={3}>
            <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label="Search action, target, route, or request ID" value={queryInput} onChange={(event) => setQueryInput(event.target.value)} /></Grid>
            <Grid size={{ xs: 6, md: 3 }}><TextField select fullWidth label="Outcome" value={outcome} onChange={(event) => { setOutcome(event.target.value); setPage(1); }}><MenuItem value="">All outcomes</MenuItem><MenuItem value="success">Succeeded</MenuItem><MenuItem value="failure">Failed</MenuItem></TextField></Grid>
            <Grid size={{ xs: 6, md: 3 }}><TextField select fullWidth label="Target type" value={entityType} onChange={(event) => { setEntityType(event.target.value); setPage(1); }}><MenuItem value="">All targets</MenuItem>{["Assessment", "CandidateAttempt", "Interview", "ProductFeedback", "Resume", "Round"].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField></Grid>
        </Grid>

        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} mb={2} gap={1}>
            <Typography component="h2" variant="h6" fontWeight={800}>{total.toLocaleString()} recorded {total === 1 ? "event" : "events"}</Typography>
            {(queryInput || outcome || entityType) && <Button size="small" onClick={() => { setQueryInput(""); setQuery(""); setOutcome(""); setEntityType(""); setPage(1); }}>Clear filters</Button>}
        </Stack>

        {error && <Alert severity="error" action={<Button color="inherit" onClick={load}>Retry</Button>}>{error}</Alert>}
        {loading ? <Stack spacing={1.5}>{[1, 2, 3, 4].map((item) => <Skeleton key={item} variant="rounded" height={110} />)}</Stack> : !items.length ? <Alert severity="info">No audit events match these filters.</Alert> : <Stack spacing={1.5}>
            {items.map((item) => {
                const succeeded = item.outcome === "success";
                const detailsOpen = expanded === item._id;
                return <Card key={item._id} variant="outlined"><CardContent>
                    <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1.5}>
                        <Box minWidth={0}>
                            <Stack direction="row" useFlexGap flexWrap="wrap" alignItems="center" gap={1}>
                                <Typography component="h3" fontWeight={800}>{actionLabels[item.action] || item.action?.replaceAll(".", " ")}</Typography>
                                <Chip size="small" label={succeeded ? "Succeeded" : "Failed"} color={succeeded ? "success" : "error"} variant="outlined" />
                                {item.statusCode && <Chip size="small" label={`HTTP ${item.statusCode}`} variant="outlined" />}
                            </Stack>
                            <Typography variant="body2" color="text.secondary" mt={.5} sx={{ overflowWrap: "anywhere" }}>
                                {item.user?.name || "System or deleted user"}{item.user?.email ? ` · ${item.user.email}` : ""} · {new Date(item.createdAt).toLocaleString()}
                            </Typography>
                            {(item.entityType || item.entityId) && <Typography variant="body2" mt={.75} sx={{ overflowWrap: "anywhere" }}>Target: {[item.entityType, item.entityId].filter(Boolean).join(" · ")}</Typography>}
                            {formatMetadata(item.metadata) && <Typography variant="body2" color="text.secondary" mt={.5} sx={{ overflowWrap: "anywhere" }}>{formatMetadata(item.metadata)}</Typography>}
                        </Box>
                        <Button size="small" onClick={() => setExpanded(detailsOpen ? "" : item._id)} aria-expanded={detailsOpen}>{detailsOpen ? "Hide details" : "View details"}</Button>
                    </Stack>
                    <Collapse in={detailsOpen}><Box mt={2} pt={2} borderTop="1px solid" borderColor="divider"><Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>{[item.method, item.path].filter(Boolean).join(" ") || "Route unavailable for legacy event"}</Typography><Typography variant="caption" color="text.secondary" display="block" mt={.5}>Request {item.requestId || "not recorded"} · {item.durationMs !== undefined ? `${item.durationMs} ms` : "duration not recorded"} · IP {item.ip || "not recorded"}</Typography><Typography variant="caption" color="text.secondary" display="block" sx={{ overflowWrap: "anywhere" }}>User agent: {item.userAgent || "not recorded"}</Typography></Box></Collapse>
                </CardContent></Card>;
            })}
        </Stack>}
        {!loading && totalPages > 1 && <Stack alignItems="center" mt={3}><Pagination page={page} count={totalPages} onChange={(_, value) => setPage(value)} color="primary" aria-label="Audit log pages" /></Stack>}
    </Container>;
}
