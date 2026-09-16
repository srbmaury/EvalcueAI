import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Container, Grid, List, ListItem, ListItemText, Stack, Typography } from "@mui/material";
import { CheckCircleOutline } from "@mui/icons-material";
import api from "../api/axios";
import { trackEvent } from "../utils/analytics";
import { describeError } from "../utils/errorFormatter";

const plans = [
    {
        id: "free",
        name: "Free",
        description: "Build a consistent interview-practice habit.",
        features: ["Progress tracking", "Practice reminders", "Role-specific practice"],
    },
    {
        id: "pro",
        name: "Pro",
        description: "Higher personal limits for active interview preparation.",
        features: ["All interview formats", "Billing management and invoices"],
    },
];

export default function PricingPage() {
    const [params] = useSearchParams();
    const [entitlements, setEntitlements] = useState(null);
    const [entitlementsLoading, setEntitlementsLoading] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const priceLabel = () => {
        const price = entitlements?.prices?.pro;
        return price ? new Intl.NumberFormat(undefined, { style: "currency", currency: price.currency.toUpperCase() }).format(price.unitAmount / 100) : null;
    };
    const intervalLabel = () => {
        const price = entitlements?.prices?.pro;
        return price?.intervalCount > 1 ? `${price.intervalCount} ${price.interval}s` : price?.interval;
    };

    useEffect(() => {
        trackEvent("pricing_viewed", { product: "practice" });
        api.get("/billing/practice/entitlements")
            .then(({ data }) => setEntitlements(data))
            .catch(() => setError("We couldn’t load your Practice plan. Try refreshing the page."))
            .finally(() => setEntitlementsLoading(false));
    }, []);

    const redirect = async (endpoint, body) => {
        try {
            setLoading(true);
            setError("");
            if (endpoint.includes("checkout")) trackEvent("checkout_started", { product: "practice", ...body });
            const { data } = await api.post(endpoint, body);
            if (!data?.url) throw new Error("Missing billing URL");
            window.location.assign(data.url);
        } catch (e) {
            setError(describeError(e, "Billing could not be opened."));
            setLoading(false);
        }
    };

    const needsPortal = Boolean(entitlements?.requiresBillingPortal);

    return <Container maxWidth="md" sx={{ py: { xs: 4, md: 7 } }}>
        <Stack alignItems="center" textAlign="center" mb={4}>
            <Typography variant="overline" color="primary.main" fontWeight={850}>Evalcue AI Practice</Typography>
            <Typography component="h1" variant="h3" fontWeight={850}>Choose your Practice plan</Typography>
            <Typography color="text.secondary" mt={1}>Choose the plan that fits how often you practice and review your resume.</Typography>
        </Stack>
        {params.get("checkout") === "cancelled" && <Alert severity="info" sx={{ mb: 3 }}>Checkout was canceled. Nothing was charged.</Alert>}
        {needsPortal && <Alert severity="warning" sx={{ mb: 3 }} action={<Button color="inherit" size="small" disabled={loading} onClick={() => redirect("/billing/practice/portal-session")}>Manage billing</Button>}>Your existing Practice subscription needs attention before you can start another checkout.</Alert>}
        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
        {entitlementsLoading ? <Stack alignItems="center" py={8} role="status"><CircularProgress /><Typography color="text.secondary" mt={2}>Loading Practice plans…</Typography></Stack> : <Grid container spacing={3}>
            {plans.map((plan) => {
                const fallbacks = { free: { interviews: 3, resumeReviews: 3 }, pro: { interviews: 100, resumeReviews: 100 } };
                const planLimits = entitlements?.planLimits?.[plan.id] || (plan.id === entitlements?.plan ? entitlements?.limits : fallbacks[plan.id]);
                const features = [`${planLimits.interviews} practice interviews each month`, `${planLimits.resumeReviews} resume reviews each month`, ...plan.features];
                const current = plan.id === entitlements?.plan;
                const price = plan.id === "pro" ? priceLabel() : null;
                return <Grid size={{ xs: 12, md: 6 }} key={plan.id}><Card variant="outlined" sx={{ height: "100%", borderColor: plan.id === "pro" ? "primary.main" : "divider", display: "flex" }}><CardContent sx={{ p: 3, display: "flex", flexDirection: "column", width: "100%" }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}><Typography variant="h4" fontWeight={850}>{plan.name}</Typography>{plan.id === "pro" && <Chip label="For active preparation" color="primary" />}</Stack>
                    {price && <Typography variant="h5" fontWeight={800} mt={1}>{price}<Typography component="span" color="text.secondary" fontSize="1rem"> / {intervalLabel()}</Typography></Typography>}
                    <Typography color="text.secondary" mt={1}>{plan.description}</Typography>
                    <List>{features.map((feature) => <ListItem key={feature} disableGutters><CheckCircleOutline color="success" sx={{ mr: 1.5 }} /><ListItemText primary={feature} /></ListItem>)}</List>
                    <Box mt="auto" pt={2}>
                        {current ? <Button fullWidth variant="contained" disabled>Current plan</Button>
                            : plan.id === "free" ? <Button fullWidth variant="outlined" disabled>Included access</Button>
                                : needsPortal ? <Button fullWidth variant="outlined" disabled={loading} onClick={() => redirect("/billing/practice/portal-session")}>Manage Practice billing</Button>
                                    : <Button fullWidth variant="contained" disabled={loading || !entitlements?.billingAvailable?.pro} onClick={() => redirect("/billing/practice/checkout-session", { plan: "pro" })}>{loading ? "Opening checkout…" : entitlements?.billingAvailable?.pro ? "Choose Pro" : "Checkout not configured"}</Button>}
                    </Box>
                </CardContent></Card></Grid>;
            })}
        </Grid>}
        {(entitlements?.plan === "pro" || needsPortal) && <Stack alignItems="center" mt={3}><Button onClick={() => redirect("/billing/practice/portal-session")} disabled={loading}>Manage invoices, cancellation, or payment method</Button></Stack>}
    </Container>;
}
