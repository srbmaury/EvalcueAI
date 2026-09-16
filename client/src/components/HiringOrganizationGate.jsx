import { useContext, useState } from "react";
import { Alert, Box, Button, CircularProgress, Container, Divider, Paper, Stack, TextField, Typography } from "@mui/material";
import { OrganizationContext } from "../context/OrganizationContext";
import { describeError } from "../utils/errorFormatter";

export default function HiringOrganizationGate({ children }) {
    const { activeOrganization, createOrganization, refreshOrganizations, loading, error } = useContext(OrganizationContext);
    const [name, setName] = useState("");
    const [creating, setCreating] = useState(false);
    const [checking, setChecking] = useState(false);
    const [createError, setCreateError] = useState("");
    const [accessMessage, setAccessMessage] = useState("");

    if (loading) {
        return <Box sx={{ minHeight: "55vh", display: "grid", placeItems: "center" }}><CircularProgress /></Box>;
    }

    if (activeOrganization) return children;

    const create = async (event) => {
        event.preventDefault();
        if (name.trim().length < 2) return;
        setCreating(true);
        setCreateError("");
        setAccessMessage("");
        try {
            await createOrganization(name.trim());
        } catch (err) {
            setCreateError(describeError(err, "Could not create organization"));
        } finally {
            setCreating(false);
        }
    };

    const checkAccess = async () => {
        setChecking(true);
        setCreateError("");
        setAccessMessage("");
        try {
            const organizations = await refreshOrganizations();
            if (!organizations?.length) {
                setAccessMessage("No organization access yet. Ask an organization owner or admin to add the email address you use for Evalcue AI, then check again.");
            }
        } catch (err) {
            setCreateError(describeError(err, "Could not check organization access"));
        } finally {
            setChecking(false);
        }
    };

    return (
        <Container maxWidth="sm" sx={{ py: { xs: 6, md: 10 } }}>
            <Paper variant="outlined" sx={{ p: { xs: 3, md: 4 }, borderRadius: 4 }}>
                <Stack spacing={3}>
                    <Box>
                        <Typography variant="overline" color="primary.main" fontWeight={850}>Hiring workspace</Typography>
                        <Typography component="h1" variant="h4" fontWeight={850} mt={.5}>Create or join a hiring organization</Typography>
                        <Typography color="text.secondary" mt={1}>Assessments, candidates, reports, shared interview credits, and team permissions belong to an organization—not to an individual recruiter.</Typography>
                    </Box>

                    {(error || createError) && <Alert severity="error">{createError || error}</Alert>}
                    {accessMessage && <Alert severity="info">{accessMessage}</Alert>}

                    <Stack component="form" spacing={1.75} onSubmit={create}>
                        <Box>
                            <Typography variant="h6" fontWeight={800}>Creating a new hiring team?</Typography>
                            <Typography variant="body2" color="text.secondary" mt={.5}>Create an organization to own your assessments, candidates, team roles, and Hiring billing.</Typography>
                        </Box>
                        <TextField label="Organization name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Acme Engineering" required />
                        <Button type="submit" variant="contained" size="large" disabled={creating || checking || name.trim().length < 2}>{creating ? "Creating…" : "Create organization"}</Button>
                    </Stack>

                    <Divider>or</Divider>

                    <Box>
                        <Typography variant="h6" fontWeight={800}>Already part of a hiring team?</Typography>
                        <Typography variant="body2" color="text.secondary" mt={.5}>Ask an organization owner or admin to add the email address you use for Evalcue AI. You do not need to create another organization.</Typography>
                        <Button type="button" variant="outlined" sx={{ mt: 2 }} onClick={checkAccess} disabled={checking || creating}>{checking ? "Checking…" : "Check for organization access"}</Button>
                    </Box>
                </Stack>
            </Paper>
        </Container>
    );
}
