import { useCallback, useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useSearchParams } from "react-router-dom";
import { Alert, Button, CircularProgress, Container, Stack, Typography } from "@mui/material";
import api from "../api/axios";

const label = (value) => value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : "Subscription";

export default function BillingSuccessPage() {
    const [params] = useSearchParams();
    const product = params.get("product") === "hiring" ? "hiring" : "practice";
    const organizationId = params.get("organizationId") || "";
    const [status, setStatus] = useState("checking");
    const [activePlan, setActivePlan] = useState("");
    const [checkingNow, setCheckingNow] = useState(false);
    const returnPath = product === "hiring" ? "/hire/team" : "/practice/dashboard";
    const billingPath = product === "hiring" ? "/hire/team" : "/practice/pricing";
    const endpoint = product === "hiring" ? "/billing/hiring/entitlements" : "/billing/practice/entitlements";
    const requestConfig = useMemo(() => product === "hiring" && organizationId
        ? { headers: { "X-Organization-Id": organizationId } }
        : undefined, [organizationId, product]);

    const checkStatus = useCallback(async () => {
        const { data } = await api.get(endpoint, requestConfig);
        const active = product === "hiring"
            ? ["starter", "growth", "enterprise"].includes(data.plan)
            : data.plan === "pro";
        if (active) {
            setActivePlan(data.plan);
            setStatus("active");
            return true;
        }
        return false;
    }, [endpoint, product, requestConfig]);

    useEffect(() => {
        let stopped = false;
        let attempts = 0;
        const check = async () => {
            try {
                const active = await checkStatus();
                if (active || stopped) return;
            } catch { /* retry while webhook settles */ }
            attempts += 1;
            if (attempts >= 8) return !stopped && setStatus("pending");
            setTimeout(check, 1500);
        };
        check();
        return () => { stopped = true; };
    }, [checkStatus]);

    const refreshStatus = async () => {
        setCheckingNow(true);
        setStatus("checking");
        try {
            const active = await checkStatus();
            if (!active) setStatus("pending");
        } catch {
            setStatus("pending");
        } finally {
            setCheckingNow(false);
        }
    };

    return <Container maxWidth="sm" sx={{ py: 10 }}><Stack spacing={3} alignItems="center" textAlign="center">
        {status === "checking" && <><CircularProgress /><Typography component="h1" variant="h4" fontWeight={850}>Confirming your subscription…</Typography><Typography color="text.secondary">Stripe completed checkout. We’re waiting for the signed webhook confirmation.</Typography></>}
        {status === "active" && <><Alert severity="success" sx={{ width: "100%" }}>{product === "hiring" ? `${label(activePlan)} Hiring is active for this organization.` : "Practice Pro is active on your account."}</Alert><Typography component="h1" variant="h4" fontWeight={850}>Your upgraded capacity is ready</Typography></>}
        {status === "pending" && <><Alert severity="info">Payment succeeded, but subscription confirmation is still processing. Refresh status here or continue to billing to confirm plan details.</Alert><Typography component="h1" variant="h4" fontWeight={850}>Confirmation pending</Typography></>}
        {status === "pending" ? <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} width={{ xs: "100%", sm: "auto" }}>
            <Button variant="contained" onClick={refreshStatus} disabled={checkingNow}>{checkingNow ? "Checking…" : "Refresh status"}</Button>
            <Button component={RouterLink} to={billingPath} variant="outlined">Go to billing</Button>
            <Button component={RouterLink} to={returnPath}>Continue anyway</Button>
        </Stack> : <Button component={RouterLink} to={returnPath} variant="contained">Continue to {product === "hiring" ? "Hiring" : "Practice"}</Button>}
    </Stack></Container>;
}
