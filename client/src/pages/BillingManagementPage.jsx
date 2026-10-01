import { useEffect, useState } from "react";
import { Link as RouterLink, useLocation, useSearchParams } from "react-router-dom";
import { Alert, Button, Container, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Typography } from "@mui/material";
import api from "../api/axios";
import { describeError } from "../utils/errorFormatter";
import { publicSupportEmail } from "../utils/publicContact";

export default function BillingManagementPage() {
    const hiring = useLocation().pathname.startsWith("/hire/");
    const [params] = useSearchParams();
    const organizationId = params.get("organizationId");
    const [billing, setBilling] = useState(null);
    const [error, setError] = useState("");
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);
    const product = hiring ? "hiring" : "practice";
    const config = hiring && organizationId ? { headers: { "X-Organization-Id": organizationId } } : undefined;
    useEffect(() => {
        api.get(`/billing/${product}/entitlements`, hiring && organizationId ? { headers: { "X-Organization-Id": organizationId } } : undefined)
            .then(({ data }) => setBilling(data)).catch(e => setError(describeError(e, "Could not load billing details.")));
    }, [product, hiring, organizationId]);
    const cancel = async () => {
        setBusy(true); setError("");
        try {
            await api.post(`/billing/${product}/cancel-subscription`, {}, config);
            setBilling((current) => ({ ...current, cancelAtPeriodEnd: true })); setConfirming(false);
        } catch (e) { setError(describeError(e, "Could not stop automatic renewal.")); }
        finally { setBusy(false); }
    };
    return <Container maxWidth="sm" sx={{ py: 6 }}><Stack spacing={3}>
        <Typography component="h1" variant="h4">Manage {hiring ? "Hire" : "Practice"} billing</Typography>
        {error && <Alert severity="error">{error}</Alert>}
        {!billing && !error && <Typography role="status">Loading billing details…</Typography>}
        {billing && <Paper variant="outlined" sx={{ p: 3 }}><Stack spacing={2}>
            <Typography fontWeight={650}>Current plan: {billing.plan}</Typography>
            <Typography color="text.secondary">Payment provider: {billing.billingProvider === "payu" ? "PayU" : billing.billingProvider}</Typography>
            {billing.currentPeriodEnd && <Typography color="text.secondary">Paid access through {new Date(billing.currentPeriodEnd).toLocaleDateString()}.</Typography>}
            {billing.cancelAtPeriodEnd ? <Alert severity="info">Automatic renewal is stopped. Your paid access continues until the end of the current period.</Alert> : billing.billingProvider === "payu" && (!hiring || billing.canManageBilling) && ["pro", "starter", "growth", "enterprise"].includes(billing.plan) && <Button variant="outlined" color="error" onClick={() => setConfirming(true)}>Stop automatic renewal</Button>}
            <Typography variant="body2" color="text.secondary">For payment receipts, refunds, or a change of payment method, contact <a href={`mailto:${publicSupportEmail}`}>{publicSupportEmail}</a>.</Typography>
        </Stack></Paper>}
        <Button component={RouterLink} to={hiring ? "/hire/team" : "/practice/pricing"}>Back to plans</Button>
        <Dialog open={confirming} onClose={() => !busy && setConfirming(false)}><DialogTitle>Stop automatic renewal?</DialogTitle><DialogContent>PayU will stop future scheduled payments. Access already paid for continues through the current period. Restarting requires a new checkout and mandate authorization.</DialogContent><DialogActions><Button disabled={busy} onClick={() => setConfirming(false)}>Keep renewal</Button><Button disabled={busy} onClick={cancel} color="error">{busy ? "Stopping…" : "Stop renewal"}</Button></DialogActions></Dialog>
    </Stack></Container>;
}
