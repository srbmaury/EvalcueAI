import { useEffect, useMemo, useState } from "react";
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
    const returnPath = product === "hiring" ? "/hire/team" : "/practice/dashboard";
    const endpoint = product === "hiring" ? "/billing/hiring/entitlements" : "/billing/practice/entitlements";
    const requestConfig = useMemo(() => product === "hiring" && organizationId
        ? { headers: { "X-Organization-Id": organizationId } }
        : undefined, [organizationId, product]);

    useEffect(() => {
        let stopped = false;
        let attempts = 0;
        const check = async () => {
            try {
                const { data } = await api.get(endpoint, requestConfig);
                const active = product === "hiring"
                    ? ["starter", "growth", "enterprise"].includes(data.plan)
                    : data.plan === "pro";
                if (active) {
                    if (!stopped) {
                        setActivePlan(data.plan);
                        setStatus("active");
                    }
                    return;
                }
            } catch { /* retry while webhook settles */ }
            attempts += 1;
            if (attempts >= 8) return !stopped && setStatus("pending");
            setTimeout(check, 1500);
        };
        check();
        return () => { stopped = true; };
    }, [endpoint, product, requestConfig]);

    return <Container maxWidth="sm" sx={{ py: 10 }}><Stack spacing={3} alignItems="center" textAlign="center">
        {status === "checking" && <><CircularProgress /><Typography component="h1" variant="h4" fontWeight={850}>Confirming your subscription…</Typography><Typography color="text.secondary">Stripe completed checkout. We’re waiting for the signed webhook confirmation.</Typography></>}
        {status === "active" && <><Alert severity="success" sx={{ width: "100%" }}>{product === "hiring" ? `${label(activePlan)} Hiring is active for this organization.` : "Practice Pro is active on your account."}</Alert><Typography component="h1" variant="h4" fontWeight={850}>Your upgraded capacity is ready</Typography></>}
        {status === "pending" && <><Alert severity="info">Payment succeeded, but subscription confirmation is still processing. Refresh shortly or contact support if this persists.</Alert><Typography component="h1" variant="h4" fontWeight={850}>Confirmation pending</Typography></>}
        <Button component={RouterLink} to={returnPath} variant="contained">Continue to {product === "hiring" ? "Hiring" : "Practice"}</Button>
    </Stack></Container>;
}
