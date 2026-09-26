import { useContext, useEffect, useRef, useState } from "react";
import { Alert, Box, CircularProgress, Container, Stack, Typography } from "@mui/material";
import { useLocation } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { setWorkspacePreference } from "../utils/workspacePreference";
import { describeError } from "../utils/errorFormatter";

export default function SsoCallbackPage() {
    const { search } = useLocation();
    const { completeSsoLogin, loading: authLoading } = useContext(AuthContext);
    const started = useRef(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (authLoading || started.current) return;
        started.current = true;
        const params = new URLSearchParams(search);
        const providerError = params.get("error");
        const exchangeCode = params.get("exchange");
        if (providerError) {
            setError(providerError);
            return;
        }
        if (!exchangeCode) {
            setError("SSO sign-in could not be completed.");
            return;
        }
        completeSsoLogin(exchangeCode)
            .then(({ user, organizationId }) => {
                if (!user?._id || !organizationId) throw new Error("SSO session did not include organization access");
                setWorkspacePreference("hiring", user._id);
                try { localStorage.setItem(`evalcue:organization:user:${user._id}`, organizationId); } catch { /* optional */ }
                // Reload once so AuthProvider and OrganizationProvider initialize from the new
                // server session and the trusted organization preference in one deterministic pass.
                window.location.replace("/hire/assessments");
            })
            .catch((err) => setError(describeError(err, err?.message || "SSO sign-in failed.")));
    }, [authLoading, completeSsoLogin, search]);

    return (
        <Container maxWidth="sm" sx={{ py: 10 }}>
            <Box textAlign="center">
                {error ? <Alert severity="error">{error}</Alert> : (
                    <Stack spacing={2} alignItems="center">
                        <CircularProgress />
                        <Typography component="h1" variant="h5" fontWeight={800}>Completing EvalcueAI Hire SSO sign-in…</Typography>
                        <Typography color="text.secondary">Verifying your organization access securely.</Typography>
                    </Stack>
                )}
            </Box>
        </Container>
    );
}
