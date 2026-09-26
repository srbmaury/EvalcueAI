import { useEffect, useState } from "react";
import { Alert, Button, Card, CardContent, Chip, Container, LinearProgress, Stack, Typography } from "@mui/material";
import api from "../api/axios";
import { describeError } from "../utils/errorFormatter";

const labelForPlan = (plan) => ({
    none: "No Hiring access",
    trial: "Standard trial",
    design_partner: "Design Partner",
    paid_pilot: "Launch Pilot",
    starter: "Starter",
    growth: "Growth",
    enterprise: "Enterprise",
}[plan] || plan);

export default function HiringPilotPage() {
    const [billing, setBilling] = useState(null);
    const [loading, setLoading] = useState(true);
    const [checkoutLoading, setCheckoutLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        api.get("/billing/hiring/entitlements")
            .then(({ data }) => setBilling(data))
            .catch((requestError) => setError(describeError(requestError, "Could not load the Launch Pilot offer.")))
            .finally(() => setLoading(false));
    }, []);

    const startCheckout = async () => {
        setCheckoutLoading(true);
        setError("");
        try {
            const { data } = await api.post("/billing/hiring/pilot-checkout-session");
            if (!data?.url) throw new Error("Missing checkout URL");
            window.location.assign(data.url);
        } catch (requestError) {
            setError(requestError?.response?.data?.message || "Could not open Launch Pilot checkout.");
            setCheckoutLoading(false);
        }
    };

    if (loading) return <Container maxWidth="sm" sx={{ py: 8 }}><LinearProgress /></Container>;

    const price = billing?.prices?.pilot;
    const priceLabel = price
        ? new Intl.NumberFormat(undefined, { style: "currency", currency: price.currency.toUpperCase() }).format(price.unitAmount / 100)
        : null;
    const pilot = billing?.pilotOffer || { candidateInterviews: 15, validDays: 30 };
    const paidSubscription = ["starter", "growth", "enterprise"].includes(billing?.plan);
    const activePilot = billing?.plan === "paid_pilot";
    const canCheckout = Boolean(billing?.canManageBilling && billing?.billingAvailable?.pilot && !billing?.requiresBillingPortal && !paidSubscription && !activePilot);

    return (
        <Container maxWidth="sm" sx={{ py: { xs: 4, md: 7 } }}>
            <Stack spacing={3}>
                <Stack alignItems="center" textAlign="center">
                    <Typography variant="overline" color="primary.main" fontWeight={850}>EvalcueAI Hire</Typography>
                    <Typography component="h1" variant="h3" fontWeight={850}>Launch Pilot</Typography>
                    <Typography color="text.secondary" mt={1}>A low-commitment paid step before moving your team to a recurring Hiring plan.</Typography>
                </Stack>

                {error && <Alert severity="error">{error}</Alert>}

                <Card variant="outlined">
                    <CardContent sx={{ p: 3 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2}>
                            <Typography variant="h5" fontWeight={850}>Paid pilot</Typography>
                            <Chip label="One-time" color="primary" variant="outlined" />
                        </Stack>
                        <Typography variant="h3" fontWeight={900} mt={2}>{priceLabel || "₹2,999"}</Typography>
                        <Typography color="text.secondary">one-time payment</Typography>
                        <Stack spacing={1} mt={3}>
                            <Typography>• {pilot.candidateInterviews} candidate interviews</Typography>
                            <Typography>• Valid for {pilot.validDays} days after successful payment</Typography>
                            <Typography>• Adaptive technical interviews and evidence-backed reports</Typography>
                            <Typography>• No recurring subscription is created</Typography>
                        </Stack>
                        <Button
                            fullWidth
                            variant="contained"
                            size="large"
                            sx={{ mt: 3 }}
                            disabled={!canCheckout || checkoutLoading}
                            onClick={startCheckout}
                        >
                            {checkoutLoading ? "Opening secure checkout…" : activePilot ? "Pilot already active" : paidSubscription ? `${labelForPlan(billing.plan)} already active` : billing?.requiresBillingPortal ? "Resolve existing billing first" : billing?.billingAvailable?.pilot ? `Start pilot for ${priceLabel || "₹2,999"}` : "Pilot checkout not configured"}
                        </Button>
                        {!billing?.canManageBilling && <Alert severity="info" sx={{ mt: 2 }}>Only an organization Owner or Admin can purchase the Launch Pilot.</Alert>}
                    </CardContent>
                </Card>

                <Card variant="outlined">
                    <CardContent>
                        <Typography fontWeight={800}>Current organization access</Typography>
                        <Typography color="text.secondary" mt={.5}>{labelForPlan(billing?.plan)} · {billing?.used?.candidateInterviews || 0} of {billing?.limits?.candidateInterviews || 0} interviews used{billing?.reserved?.candidateInterviews ? ` · ${billing.reserved.candidateInterviews} in progress (counts toward the limit)` : ""}.</Typography>
                        {billing?.grant?.expiresAt && <Typography variant="body2" color="text.secondary" mt={.5}>Current grant expires {new Date(billing.grant.expiresAt).toLocaleDateString()}.</Typography>}
                    </CardContent>
                </Card>
            </Stack>
        </Container>
    );
}
