import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Container, FormControl, InputLabel, MenuItem, Paper, Select, Stack, Typography } from "@mui/material";
import api from "../api/axios";
import { useNotify } from "../context/NotificationContext";
import ConfirmActionDialog from "../components/ConfirmActionDialog";

const QUEUES = [
    { value: "prepare-questions", label: "Question preparation" },
    { value: "bulk-feedback", label: "Bulk feedback" },
];

export default function AdminJobsPage() {
    const [queue, setQueue] = useState(QUEUES[0].value);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState("");
    const [error, setError] = useState("");
    const [removeTarget, setRemoveTarget] = useState(null);
    const notify = useNotify();

    const load = useCallback(async () => {
        setLoading(true); setError("");
        try { const { data } = await api.get(`/jobs/failed/${queue}`); setItems(data?.items || []); }
        catch (err) { setError(err?.response?.data?.message || "Could not load failed jobs."); }
        finally { setLoading(false); }
    }, [queue]);

    useEffect(() => { load(); }, [load]);

    const act = async (id, action) => {
        setBusyId(id); setError("");
        try {
            if (action === "retry") await api.post(`/jobs/retry/${queue}/${encodeURIComponent(id)}`);
            else await api.delete(`/jobs/remove/${queue}/${encodeURIComponent(id)}`);
            notify(action === "retry" ? "Job queued for retry." : "Job removed.", "success");
            setRemoveTarget(null);
            await load();
        } catch (err) { setError(err?.response?.data?.message || `Could not ${action} this job.`); }
        finally { setBusyId(""); }
    };

    const queueLabel = QUEUES.find((item) => item.value === queue)?.label || queue;

    return <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={2} alignItems={{ md: "center" }}>
            <Box><Typography variant="overline" color="primary.main" fontWeight={850}>Platform administration</Typography><Typography component="h1" variant="h3" fontWeight={850}>Failed jobs</Typography><Typography color="text.secondary" mt={1}>Inspect the bounded failed-job queues and retry or remove individual jobs. This is an operational tool, not a candidate-facing queue.</Typography></Box>
            <Stack direction="row" spacing={1}><FormControl size="small" sx={{ minWidth: 220 }}><InputLabel id="failed-job-queue-label">Queue</InputLabel><Select labelId="failed-job-queue-label" label="Queue" value={queue} onChange={(e) => setQueue(e.target.value)}>{QUEUES.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}</Select></FormControl><Button variant="outlined" onClick={load} disabled={loading}>Refresh</Button></Stack>
        </Stack>
        {error && <Alert severity="error" sx={{ mt: 3 }}>{error}</Alert>}
        {loading ? <Box py={8} display="grid" sx={{ placeItems: "center" }}><CircularProgress /></Box> : <Stack spacing={1.5} mt={3}>{items.length ? items.map((job) => <Paper key={job.id} variant="outlined" sx={{ p: 2.5 }}><Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={2} alignItems={{ md: "center" }}><Box minWidth={0}><Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap"><Typography fontWeight={850}>{job.name || "Failed job"}</Typography><Chip size="small" label={queueLabel} variant="outlined" /><Chip size="small" label={`${job.attemptsMade || 0} attempt${job.attemptsMade === 1 ? "" : "s"}`} /></Stack><Typography variant="body2" color="text.secondary" mt={.5}>ID: {job.id}</Typography><Typography variant="body2" color="error.main" mt={1} sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{job.failedReason || "No failure reason was recorded."}</Typography>{job.timestamp && <Typography variant="caption" color="text.secondary">Created {new Date(job.timestamp).toLocaleString()}</Typography>}</Box><Stack direction="row" spacing={1} flexShrink={0}><Button variant="contained" disabled={Boolean(busyId)} onClick={() => act(job.id, "retry")}>{busyId === job.id ? "Working…" : "Retry"}</Button><Button color="error" variant="outlined" disabled={Boolean(busyId)} onClick={() => setRemoveTarget(job)}>Remove</Button></Stack></Stack></Paper>) : <Paper variant="outlined" sx={{ p: 4, textAlign: "center" }}><Typography fontWeight={800}>No failed jobs</Typography><Typography color="text.secondary" mt={.5}>This queue currently has nothing requiring manual intervention.</Typography></Paper>}</Stack>}
        <ConfirmActionDialog
            open={Boolean(removeTarget)}
            title="Remove failed job from queue?"
            body={removeTarget ? `This will discard ${removeTarget.name || removeTarget.id} from the ${queueLabel} queue.` : ""}
            warning="The job will not be retried after it is removed."
            confirmLabel="Remove job"
            confirmColor="error"
            confirming={busyId === removeTarget?.id}
            onCancel={() => setRemoveTarget(null)}
            onConfirm={() => removeTarget && act(removeTarget.id, "remove")}
        />
    </Container>;
}
