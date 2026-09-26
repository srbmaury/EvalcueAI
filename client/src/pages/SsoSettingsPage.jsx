import { useContext, useEffect, useState } from "react";
import { Alert, Button, Chip, Container, FormControlLabel, MenuItem, Paper, Stack, Switch, TextField, Typography } from "@mui/material";
import { Navigate } from "react-router-dom";
import api from "../api/axios";
import { OrganizationContext } from "../context/OrganizationContext";
import { hiringHomeForRole, hiringPermissionsFor } from "../utils/hiringPermissions";
import { describeError } from "../utils/errorFormatter";

const defaults = {
    enabled: false,
    issuer: "",
    clientId: "",
    clientSecret: "",
    domainsText: "",
    tokenAuthMethod: "client_secret_post",
    jitProvisioning: false,
    defaultRole: "reviewer",
};

export default function SsoSettingsPage() {
    const { activeOrganization, currentRole } = useContext(OrganizationContext);
    const { canManageOrganization } = hiringPermissionsFor(currentRole);
    const [form, setForm] = useState(defaults);
    const [hasClientSecret, setHasClientSecret] = useState(false);
    const [availableOnPlan, setAvailableOnPlan] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    useEffect(() => {
        if (!activeOrganization?._id || !canManageOrganization) return;
        setLoading(true);
        api.get("/sso/settings")
            .then(({ data }) => {
                setAvailableOnPlan(Boolean(data.availableOnPlan));
                setHasClientSecret(Boolean(data.hasClientSecret));
                setForm({
                    enabled: Boolean(data.enabled),
                    issuer: data.issuer || "",
                    clientId: data.clientId || "",
                    clientSecret: "",
                    domainsText: (data.domains || []).join(", "),
                    tokenAuthMethod: data.tokenAuthMethod || "client_secret_post",
                    jitProvisioning: Boolean(data.jitProvisioning),
                    defaultRole: data.defaultRole || "reviewer",
                });
            })
            .catch((err) => setError(describeError(err, "Could not load SSO settings")))
            .finally(() => setLoading(false));
    }, [activeOrganization?._id, canManageOrganization]);

    if (!canManageOrganization) return <Navigate to={hiringHomeForRole(currentRole)} replace />;

    const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
    const save = async (event) => {
        event.preventDefault();
        setSaving(true);
        setError("");
        setSuccess("");
        try {
            const domains = form.domainsText.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean);
            const payload = {
                enabled: form.enabled,
                issuer: form.issuer,
                clientId: form.clientId,
                domains,
                tokenAuthMethod: form.tokenAuthMethod,
                jitProvisioning: form.jitProvisioning,
                defaultRole: form.defaultRole,
                ...(form.clientSecret ? { clientSecret: form.clientSecret } : {}),
            };
            await api.put("/sso/settings", payload);
            if (form.clientSecret) setHasClientSecret(true);
            update("clientSecret", "");
            setSuccess("SSO settings saved.");
        } catch (err) {
            setError(err?.response?.data?.message || "Could not save SSO settings");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Container maxWidth="md" sx={{ py: { xs: 4, md: 6 } }}>
            <Stack spacing={3}>
                <Stack spacing={1}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Typography component="h1" variant="h3" fontWeight={850}>Work SSO</Typography>
                        <Chip label="OIDC" color="primary" variant="outlined" />
                        <Chip label="Enterprise" variant="outlined" />
                    </Stack>
                    <Typography color="text.secondary">Connect {activeOrganization?.name} to Microsoft Entra ID, Okta, Auth0, Google Workspace, or another OpenID Connect provider.</Typography>
                </Stack>

                {!availableOnPlan && <Alert severity="info">SSO is an Enterprise Hiring feature. It remains available in development/test environments so your team can configure and validate it before a contract is activated.</Alert>}
                {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
                {success && <Alert severity="success" onClose={() => setSuccess("")}>{success}</Alert>}

                <Paper component="form" variant="outlined" sx={{ p: 3, borderRadius: 4 }} onSubmit={save}>
                    <Stack spacing={2.5}>
                        <FormControlLabel control={<Switch checked={form.enabled} onChange={(event) => update("enabled", event.target.checked)} />} label="Enable work SSO for this organization" />
                        <TextField label="OIDC issuer URL" value={form.issuer} onChange={(event) => update("issuer", event.target.value)} placeholder="https://login.microsoftonline.com/<tenant>/v2.0" required />
                        <TextField label="Client ID" value={form.clientId} onChange={(event) => update("clientId", event.target.value)} required />
                        <TextField label={hasClientSecret ? "Replace client secret (optional)" : "Client secret"} value={form.clientSecret} onChange={(event) => update("clientSecret", event.target.value)} type="password" required={!hasClientSecret} helperText={hasClientSecret ? "A secret is already stored encrypted. Leave blank to keep it." : "Stored encrypted at rest by EvalcueAI."} />
                        <TextField label="Allowed work email domains" value={form.domainsText} onChange={(event) => update("domainsText", event.target.value)} placeholder="acme.com, engineering.acme.com" required helperText="Only identities whose asserted email matches one of these domains can enter this organization." />
                        <TextField select label="Token endpoint authentication" value={form.tokenAuthMethod} onChange={(event) => update("tokenAuthMethod", event.target.value)}>
                            <MenuItem value="client_secret_post">Client secret in POST body</MenuItem>
                            <MenuItem value="client_secret_basic">HTTP Basic client authentication</MenuItem>
                        </TextField>
                        <FormControlLabel control={<Switch checked={form.jitProvisioning} onChange={(event) => update("jitProvisioning", event.target.checked)} />} label="Just-in-time provision organization members" />
                        <TextField select label="Default role for JIT users" value={form.defaultRole} onChange={(event) => update("defaultRole", event.target.value)} disabled={!form.jitProvisioning}>
                            <MenuItem value="reviewer">Reviewer</MenuItem>
                            <MenuItem value="hiring_manager">Hiring Manager</MenuItem>
                            <MenuItem value="recruiter">Recruiter</MenuItem>
                        </TextField>
                        <Alert severity="warning">Use Reviewer as the default unless your identity provider population is already tightly scoped. Owner and Admin are never available through JIT provisioning.</Alert>
                        <Button type="submit" variant="contained" size="large" disabled={loading || saving || (form.enabled && !availableOnPlan)}>{saving ? "Saving…" : "Save SSO settings"}</Button>
                    </Stack>
                </Paper>
            </Stack>
        </Container>
    );
}
