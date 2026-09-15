import { useCallback, useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Alert, Box, Button, Card, CardContent, CircularProgress, Container, Grid, Paper, Stack, Typography } from "@mui/material";
import api from "../api/axios";
import { describeError } from "../utils/errorFormatter";

const cards = [
    ["Users", "users"],
    ["Verified users", "verifiedUsers"],
    ["Active sessions", "activeSessions"],
    ["Practice interviews", "interviews"],
    ["Completed interviews", "completedInterviews"],
    ["New feedback", "newFeedback"],
    ["Failed reminders", "failedReminders"],
];

export default function AdminOverviewPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const response = await api.get("/admin/overview");
            setData(response.data || {});
        } catch (err) {
            setError(describeError(err, "Could not load the admin overview."));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);
    const events = useMemo(() => Object.entries(data?.events || {}).sort((a, b) => b[1] - a[1]), [data?.events]);

    return <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={2} alignItems={{ md: "center" }}>
            <Box><Typography variant="overline" color="primary.main" fontWeight={850}>Platform administration</Typography><Typography component="h1" variant="h3" fontWeight={850}>Operations overview</Typography><Typography color="text.secondary" mt={1}>A compact view of account activity, interview usage, feedback, and operational follow-up.</Typography></Box>
            <Button variant="outlined" onClick={load} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</Button>
        </Stack>
        {error && <Alert severity="error" sx={{ mt: 3 }}>{error}</Alert>}
        {loading && !data ? <Box py={8} display="grid" sx={{ placeItems: "center" }}><CircularProgress /></Box> : <>
            <Grid container spacing={2} mt={1}>{cards.map(([label, key]) => <Grid key={key} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}><Card variant="outlined" sx={{ height: "100%" }}><CardContent><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="h4" fontWeight={850} mt={.5}>{Number(data?.[key] || 0).toLocaleString()}</Typography></CardContent></Card></Grid>)}</Grid>
            <Grid container spacing={3} mt={1}>
                <Grid size={{ xs: 12, md: 7 }}><Paper variant="outlined" sx={{ p: 3, height: "100%" }}><Typography variant="h5" fontWeight={800}>Product events · last 30 days</Typography><Typography variant="body2" color="text.secondary" mt={.5}>Server-recorded product events, ordered by volume.</Typography><Stack spacing={1.25} mt={2}>{events.length ? events.map(([event, count]) => <Stack key={event} direction="row" justifyContent="space-between" gap={2}><Typography sx={{ wordBreak: "break-word" }}>{event}</Typography><Typography fontWeight={800}>{Number(count).toLocaleString()}</Typography></Stack>) : <Typography color="text.secondary">No product events were recorded in this period.</Typography>}</Stack></Paper></Grid>
                <Grid size={{ xs: 12, md: 5 }}><Paper variant="outlined" sx={{ p: 3, height: "100%" }}><Typography variant="h5" fontWeight={800}>Admin tools</Typography><Typography variant="body2" color="text.secondary" mt={.5}>Move from platform health to the workflow that needs attention.</Typography><Stack spacing={1.25} mt={2}><Button component={RouterLink} to="/admin/commercial" variant="outlined">Commercial access</Button><Button component={RouterLink} to="/admin/calibration" variant="outlined">AI calibration</Button><Button component={RouterLink} to="/admin/feedback" variant="outlined">Product feedback</Button><Button component={RouterLink} to="/admin/audit" variant="outlined">Audit log</Button><Button component={RouterLink} to="/admin/jobs" variant="outlined">Failed jobs</Button></Stack></Paper></Grid>
            </Grid>
        </>}
    </Container>;
}
