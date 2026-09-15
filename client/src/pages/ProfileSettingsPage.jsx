import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Chip, CircularProgress, Container, Paper, Stack, Typography } from "@mui/material";
import ProfilePage from "./ProfilePage";
import api from "../api/axios";
import { describeError } from "../utils/errorFormatter";

const statusColor = (status) => ({ sent: "success", failed: "error", pending: "warning", skipped: "default" }[status] || "default");

function ReminderDeliveryHistory() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const load = useCallback(async () => {
        setLoading(true); setError("");
        try { const { data } = await api.get("/auth/reminders/deliveries"); setItems(data?.items || []); }
        catch (err) { setError(describeError(err, "Could not load weekly plan delivery history.")); }
        finally { setLoading(false); }
    }, []);
    useEffect(() => { load(); }, [load]);

    return <Container maxWidth="md" sx={{ pb: { xs: 4, md: 6 }, pt: 0 }}>
        <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1} alignItems={{ sm: "center" }}>
                <div><Typography component="h2" variant="h6" fontWeight={800}>Recent weekly plans</Typography><Typography variant="body2" color="text.secondary">The last 10 delivery attempts for your Weekly Practice Plan email.</Typography></div>
                <Button size="small" variant="outlined" onClick={load} disabled={loading}>Refresh</Button>
            </Stack>
            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
            {loading ? <Stack py={3} alignItems="center"><CircularProgress size={24} /></Stack> : <Stack spacing={1.25} mt={2}>{items.length ? items.map((item, index) => <Stack key={`${item.reminderKey || item.scheduledFor}-${index}`} direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1} py={1} borderBottom={index === items.length - 1 ? 0 : "1px solid"} borderColor="divider"><div><Typography fontWeight={750}>{item.scheduledFor ? new Date(item.scheduledFor).toLocaleString() : "Weekly plan delivery"}</Typography><Typography variant="caption" color="text.secondary">{item.sentAt ? `Sent ${new Date(item.sentAt).toLocaleString()}` : `${item.attempts || 0} delivery attempt${item.attempts === 1 ? "" : "s"}`}{item.lastError ? ` · ${item.lastError}` : ""}</Typography></div><Chip size="small" label={item.status || "unknown"} color={statusColor(item.status)} variant="outlined" /></Stack>) : <Typography color="text.secondary">No weekly plans delivered yet.</Typography>}</Stack>}
        </Paper>
    </Container>;
}

export default function ProfileSettingsPage() {
    return <><ProfilePage /><ReminderDeliveryHistory /></>;
}
