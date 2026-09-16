import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Link as RouterLink, Navigate } from "react-router-dom";
import { Alert, Box, Button, Chip, Container, Divider, FormControl, InputLabel, LinearProgress, MenuItem, Paper, Select, Stack, TextField, Typography } from "@mui/material";
import api from "../api/axios";
import { OrganizationContext } from "../context/OrganizationContext";
import { assignableHiringRolesFor, canManageHiringMember, HIRING_ROLE_LABELS, hiringHomeForRole, hiringPermissionsFor } from "../utils/hiringPermissions";
import ConfirmActionDialog from "../components/ConfirmActionDialog";
import { describeError } from "../utils/errorFormatter";

export default function HiringTeamPage() {
    const { activeOrganization, currentRole, organizations, loading: organizationLoading, selectOrganization, createOrganization, refreshOrganizations } = useContext(OrganizationContext);
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [email, setEmail] = useState("");
    const [role, setRole] = useState("recruiter");
    const [organizationName, setOrganizationName] = useState("");
    const [renameValue, setRenameValue] = useState("");
    const [renaming, setRenaming] = useState(false);
    const [adding, setAdding] = useState(false);
    const [billing, setBilling] = useState(null);
    const [billingLoading, setBillingLoading] = useState(false);
    const [billingActionLoading, setBillingActionLoading] = useState(false);
    const [teamActionLoading, setTeamActionLoading] = useState(false);
    const [confirmTarget, setConfirmTarget] = useState(null);
    const { canManageOrganization } = hiringPermissionsFor(currentRole);
    const assignableRoles = useMemo(() => assignableHiringRolesFor(currentRole), [currentRole]);

    useEffect(() => { setRenameValue(activeOrganization?.name || ""); }, [activeOrganization?._id, activeOrganization?.name]);

    const loadMembers = useCallback(async () => {
        if (!activeOrganization?._id || !canManageOrganization) return;
        setLoading(true);
        setError("");
        try {
            const { data } = await api.get(`/organizations/${activeOrganization._id}/members`);
            setMembers(data?.members || []);
        } catch (err) {
            setError(describeError(err, "Could not load team members"));
        } finally {
            setLoading(false);
        }
    }, [activeOrganization?._id, canManageOrganization]);

    useEffect(() => {
        if (!canManageOrganization) { setMembers([]); return; }
        loadMembers();
    }, [canManageOrganization, loadMembers]);

    useEffect(() => {
        if (assignableRoles.length && !assignableRoles.includes(role)) setRole(assignableRoles[0]);
    }, [assignableRoles, role]);

    useEffect(() => {
        if (!activeOrganization?._id || !canManageOrganization) return;
        setBillingLoading(true);
        api.get("/billing/hiring/entitlements")
            .then(({ data }) => setBilling(data))
            .catch((err) => setError(describeError(err, "Could not load Hiring plan")))
            .finally(() => setBillingLoading(false));
    }, [activeOrganization?._id, canManageOrganization]);

    const memberCountLabel = useMemo(() => `${members.length} active member${members.length === 1 ? "" : "s"}`, [members.length]);

    const renameOrganization = async (event) => {
        event.preventDefault();
        const name = renameValue.trim();
        if (name.length < 2 || name === activeOrganization?.name) return;
        setRenaming(true); setError("");
        try {
            await api.patch(`/organizations/${activeOrganization._id}`, { name });
            await refreshOrganizations();
        } catch (err) { setError(describeError(err, "Could not rename organization")); }
        finally { setRenaming(false); }
    };

    const addMember = async (event) => {
        event.preventDefault();
        if (!email.trim()) return;
        setAdding(true);
        setError("");
        try {
            await api.post(`/organizations/${activeOrganization._id}/members`, { email: email.trim(), role });
            setEmail("");
            await loadMembers();
            await refreshOrganizations();
        } catch (err) {
            setError(describeError(err, "Could not add team member"));
        } finally {
            setAdding(false);
        }
    };

    const changeRole = async (membershipId, nextRole) => {
        setTeamActionLoading(true);
        setError("");
        try {
            await api.patch(`/organizations/${activeOrganization._id}/members/${membershipId}`, { role: nextRole });
            setConfirmTarget(null);
            await loadMembers();
        } catch (err) {
            setError(describeError(err, "Could not update role"));
        } finally {
            setTeamActionLoading(false);
        }
    };

    const transferOwnership = async (membershipId) => {
        setTeamActionLoading(true);
        setError("");
        try {
            await api.post(`/organizations/${activeOrganization._id}/transfer-ownership`, { membershipId });
            setConfirmTarget(null);
            await refreshOrganizations();
            await loadMembers();
        } catch (err) {
            setError(describeError(err, "Could not transfer ownership"));
        } finally {
            setTeamActionLoading(false);
        }
    };

    const removeMember = async (membershipId) => {
        setTeamActionLoading(true);
        setError("");
        try {
            await api.delete(`/organizations/${activeOrganization._id}/members/${membershipId}`);
            setConfirmTarget(null);
            await loadMembers();
            await refreshOrganizations();
        } catch (err) {
            setError(describeError(err, "Could not remove member"));
        } finally {
            setTeamActionLoading(false);
        }
    };

    const billingRedirect = async (endpoint, body) => {
        try {
            setBillingActionLoading(true);
            setError("");
            const { data } = await api.post(endpoint, body);
            if (!data?.url) throw new Error("Missing billing URL");
            window.location.assign(data.url);
        } catch (err) {
            setError(describeError(err, "Could not open Hiring billing"));
            setBillingActionLoading(false);
        }
    };

    const formatPrice = (plan) => {
        const price = billing?.prices?.[plan];
        if (!price) return null;
        const amount = new Intl.NumberFormat(undefined, { style: "currency", currency: price.currency.toUpperCase() }).format(price.unitAmount / 100);
        const interval = price.intervalCount > 1 ? `${price.intervalCount} ${price.interval}s` : price.interval;
        return `${amount} / ${interval}`;
    };

    const planLabel = (plan) => ({ none: "No plan", trial: "Trial", starter: "Starter", growth: "Growth", enterprise: "Enterprise" }[plan] || plan);
    const needsBillingPortal = Boolean(billing?.requiresBillingPortal);

    const createAnotherOrganization = async (event) => {
        event.preventDefault();
        if (organizationName.trim().length < 2) return;
        setError("");
        try {
            await createOrganization(organizationName.trim());
            setOrganizationName("");
        } catch (err) {
            setError(describeError(err, "Could not create organization"));
        }
    };

    const confirmation = useMemo(() => {
        if (!confirmTarget) return null;
        const memberName = confirmTarget.membership?.user?.name || confirmTarget.membership?.user?.email || "this member";
        if (confirmTarget.kind === "role") {
            return {
                title: "Change organization role?",
                body: `${memberName} will become ${HIRING_ROLE_LABELS[confirmTarget.nextRole] || confirmTarget.nextRole} in ${activeOrganization?.name}.`,
                warning: "Role changes affect assessment access, candidate data visibility, and organization controls.",
                confirmLabel: "Change role",
                confirmColor: "primary",
                onConfirm: () => changeRole(confirmTarget.membership._id, confirmTarget.nextRole),
            };
        }
        if (confirmTarget.kind === "owner") {
            return {
                title: "Make this member organization owner?",
                body: `${memberName} will receive ownership-level control of billing, team access, and assessments for ${activeOrganization?.name}.`,
                warning: "Only transfer ownership when this person should control the organization.",
                confirmLabel: "Make owner",
                confirmColor: "warning",
                onConfirm: () => transferOwnership(confirmTarget.membership._id),
            };
        }
        if (confirmTarget.kind === "remove") {
            return {
                title: "Remove team member?",
                body: `${memberName} will lose access to ${activeOrganization?.name}'s assessments, candidate pipeline, reports, and billing information.`,
                warning: "This does not delete their personal Evalcue AI account.",
                confirmLabel: "Remove member",
                confirmColor: "error",
                onConfirm: () => removeMember(confirmTarget.membership._id),
            };
        }
        return null;
    }, [activeOrganization?.name, confirmTarget]);

    if (organizationLoading) return <Container maxWidth="lg" sx={{ py: 6 }}><LinearProgress /></Container>;
    if (!activeOrganization) return null;
    if (!canManageOrganization) return <Navigate to={hiringHomeForRole(currentRole)} replace />;

    return (
        <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
            <Stack spacing={4}>
                <Box>
                    <Typography variant="overline" color="primary.main" fontWeight={850}>Hiring</Typography>
                    <Typography component="h1" variant="h3" fontWeight={850} letterSpacing="-.035em">Organization settings</Typography>
                    <Typography color="text.secondary" mt={1}>Manage your team, shared candidate-interview capacity, organization billing, and enterprise access.</Typography>
                    <Button component={RouterLink} to="/hire/sso" variant="outlined" sx={{ mt: 2 }}>Configure work SSO</Button>
                </Box>

                {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}

                <Paper variant="outlined" sx={{ p: 3, borderRadius: 4 }}>
                    <Stack direction={{ xs: "column", md: "row" }} spacing={2} justifyContent="space-between" alignItems={{ md: "center" }}>
                        <Box>
                            <Typography variant="h5" fontWeight={800}>{activeOrganization?.name}</Typography>
                            <Stack direction="row" spacing={1} mt={1} alignItems="center">
                                <Chip size="small" label={HIRING_ROLE_LABELS[currentRole] || currentRole} color="primary" variant="outlined" />
                                <Typography variant="body2" color="text.secondary">{memberCountLabel}</Typography>
                            </Stack>
                        </Box>
                        {organizations.length > 1 && (
                            <FormControl size="small" sx={{ minWidth: 220 }}>
                                <InputLabel id="organization-select-label">Organization</InputLabel>
                                <Select labelId="organization-select-label" label="Organization" value={activeOrganization?._id || ""} onChange={(event) => selectOrganization(event.target.value)}>
                                    {organizations.map((organization) => <MenuItem key={organization._id} value={organization._id}>{organization.name}</MenuItem>)}
                                </Select>
                            </FormControl>
                        )}
                    </Stack>
                    <Divider sx={{ my: 2.5 }} />
                    <Box component="form" onSubmit={renameOrganization}>
                        <Typography fontWeight={800}>Organization name</Typography>
                        <Typography variant="body2" color="text.secondary" mt={.5}>Shown throughout the Hire workspace and on candidate assessment pages.</Typography>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} mt={1.5}>
                            <TextField fullWidth label="Organization name" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} inputProps={{ maxLength: 120 }} />
                            <Button type="submit" variant="outlined" disabled={renaming || renameValue.trim().length < 2 || renameValue.trim() === activeOrganization?.name}>{renaming ? "Saving…" : "Save name"}</Button>
                        </Stack>
                    </Box>
                </Paper>

                <Paper variant="outlined" sx={{ p: 3, borderRadius: 4 }}>
                    <Typography variant="h5" fontWeight={800}>Members</Typography>
                    <Typography color="text.secondary" mt={.5}>Roles are scoped to this organization. Platform admin access remains separate.</Typography>
                    <Stack divider={<Divider flexItem />} mt={2}>
                        {members.map((membership) => {
                            const isOwner = membership.role === "owner";
                            const canManageThisMember = canManageHiringMember(currentRole, membership.role);
                            return (
                                <Stack key={membership._id} direction={{ xs: "column", sm: "row" }} spacing={2} py={2} justifyContent="space-between" alignItems={{ sm: "center" }}>
                                    <Box minWidth={0}>
                                        <Typography fontWeight={750}>{membership.user?.name || membership.user?.email}</Typography>
                                        <Typography variant="body2" color="text.secondary">{membership.user?.email}</Typography>
                                    </Box>
                                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                        {canManageThisMember ? (
                                            <FormControl size="small" sx={{ minWidth: 160 }}>
                                                <Select value={membership.role} onChange={(event) => setConfirmTarget({ kind: "role", membership, nextRole: event.target.value })} aria-label={`Role for ${membership.user?.email}`}>
                                                    {assignableRoles.map((item) => <MenuItem key={item} value={item}>{HIRING_ROLE_LABELS[item]}</MenuItem>)}
                                                </Select>
                                            </FormControl>
                                        ) : <Chip size="small" label={HIRING_ROLE_LABELS[membership.role] || membership.role} />}
                                        {currentRole === "owner" && !isOwner && <Button size="small" onClick={() => setConfirmTarget({ kind: "owner", membership })}>Make owner</Button>}
                                        {canManageThisMember && <Button color="error" size="small" onClick={() => setConfirmTarget({ kind: "remove", membership })}>Remove</Button>}
                                    </Stack>
                                </Stack>
                            );
                        })}
                        {!loading && members.length === 0 && <Typography color="text.secondary" py={3}>No active members.</Typography>}
                    </Stack>
                </Paper>

                {canManageOrganization && (
                    <Paper component="form" variant="outlined" sx={{ p: 3, borderRadius: 4 }} onSubmit={addMember}>
                        <Typography variant="h5" fontWeight={800}>Add existing Evalcue AI user</Typography>
                        <Typography color="text.secondary" mt={.5}>For now, the person must already have an Evalcue AI account. Email invitations can be added later.</Typography>
                        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} mt={2}>
                            <TextField label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required fullWidth />
                            <FormControl sx={{ minWidth: 190 }}>
                                <InputLabel id="new-member-role-label">Role</InputLabel>
                                <Select labelId="new-member-role-label" label="Role" value={role} onChange={(event) => setRole(event.target.value)}>
                                    {assignableRoles.map((item) => <MenuItem key={item} value={item}>{HIRING_ROLE_LABELS[item]}</MenuItem>)}
                                </Select>
                            </FormControl>
                            <Button type="submit" variant="contained" disabled={adding}>{adding ? "Adding…" : "Add member"}</Button>
                        </Stack>
                    </Paper>
                )}

                <Paper variant="outlined" sx={{ p: 3, borderRadius: 4 }}>
                    <Typography variant="h5" fontWeight={800}>Plan & billing</Typography>
                    <Typography color="text.secondary" mt={.5}>Hiring billing belongs to {activeOrganization?.name}. Every member uses the same organization capacity; personal Practice plans do not affect it.</Typography>
                    {billingLoading ? <Typography color="text.secondary" mt={2}>Loading Hiring usage…</Typography> : billing && <Stack spacing={2.5} mt={2.5}>
                        {needsBillingPortal && <Alert severity="warning" action={billing.canManageBilling ? <Button color="inherit" size="small" disabled={billingActionLoading} onClick={() => billingRedirect("/billing/hiring/portal-session")}>Manage billing</Button> : null}>This organization already has a Hiring subscription that needs attention. Resolve it in billing before starting another checkout.</Alert>}
                        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={2} alignItems={{ md: "center" }}>
                            <Box>
                                <Stack direction="row" spacing={1} alignItems="center"><Typography variant="h6" fontWeight={800}>{planLabel(billing.plan)} Hiring</Typography><Chip size="small" label={billing.periodType === "lifetime" ? "Lifetime trial credits" : "Monthly capacity"} /></Stack>
                                <Typography variant="body2" color="text.secondary" mt={.5}>{billing.used.candidateInterviews} of {billing.limits.candidateInterviews} candidate interviews used{billing.periodType === "month" ? ` in ${billing.period}` : ""}.</Typography>
                            </Box>
                            {billing.canManageBilling && billing.hasBillingAccount && (["starter", "growth", "enterprise"].includes(billing.plan) || needsBillingPortal) && <Button variant="outlined" disabled={billingActionLoading} onClick={() => billingRedirect("/billing/hiring/portal-session")}>Manage billing</Button>}
                        </Stack>
                        <LinearProgress variant="determinate" value={billing.limits.candidateInterviews > 0 ? Math.min(100, (billing.used.candidateInterviews / billing.limits.candidateInterviews) * 100) : 100} sx={{ height: 8, borderRadius: 99 }} />
                        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                            {["starter", "growth"].map((plan) => {
                                const limit = billing.planLimits?.[plan]?.candidateInterviews;
                                const current = billing.plan === plan;
                                const checkoutAvailable = billing.billingAvailable?.[plan] && !needsBillingPortal;
                                return <Paper key={plan} variant="outlined" sx={{ p: 2, flex: 1, borderColor: current ? "primary.main" : "divider" }}><Typography fontWeight={800}>{planLabel(plan)}</Typography><Typography variant="h6" mt={.5}>{limit} candidate interviews / month</Typography>{formatPrice(plan) && <Typography color="text.secondary">{formatPrice(plan)}</Typography>}<Button sx={{ mt: 1.5 }} fullWidth variant={plan === "growth" ? "contained" : "outlined"} disabled={!billing.canManageBilling || current || billingActionLoading || !checkoutAvailable} onClick={() => billingRedirect("/billing/hiring/checkout-session", { plan })}>{current ? "Current plan" : needsBillingPortal ? "Resolve existing billing" : billing.billingAvailable?.[plan] ? `Choose ${planLabel(plan)}` : "Checkout not configured"}</Button></Paper>;
                            })}
                            <Paper variant="outlined" sx={{ p: 2, flex: 1 }}><Typography fontWeight={800}>Enterprise</Typography><Typography variant="h6" mt={.5}>Custom capacity</Typography><Typography color="text.secondary">Custom capacity, OIDC work SSO, API access, and retention controls for enterprise hiring teams.</Typography><Button sx={{ mt: 1.5 }} fullWidth variant="outlined" disabled>Contact sales</Button></Paper>
                        </Stack>
                        {!billing.canManageBilling && <Alert severity="info">Only organization Owners and Admins can change Hiring billing. Your role can still see shared usage.</Alert>}
                    </Stack>}
                </Paper>

                <Paper component="form" variant="outlined" sx={{ p: 3, borderRadius: 4 }} onSubmit={createAnotherOrganization}>
                    <Typography variant="h5" fontWeight={800}>Create another organization</Typography>
                    <Typography color="text.secondary" mt={.5}>Useful if you hire for multiple companies or teams that need separate candidate data.</Typography>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} mt={2}>
                        <TextField label="Organization name" value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} fullWidth />
                        <Button type="submit" variant="outlined" disabled={organizationName.trim().length < 2}>Create</Button>
                    </Stack>
                </Paper>
            </Stack>
            <ConfirmActionDialog
                open={Boolean(confirmation)}
                title={confirmation?.title}
                body={confirmation?.body}
                warning={confirmation?.warning}
                confirmLabel={confirmation?.confirmLabel}
                confirmColor={confirmation?.confirmColor}
                confirming={teamActionLoading}
                onCancel={() => setConfirmTarget(null)}
                onConfirm={confirmation?.onConfirm}
            />
        </Container>
    );
}
