import { useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Accordion, AccordionDetails, AccordionSummary, Alert, Autocomplete, Avatar, Box, Button, Card, CardContent, Container, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, InputAdornment, MenuItem, Paper, Stack, Switch, TextField, Typography } from "@mui/material";
import { ExpandMoreRounded, FlagOutlined, LockOutlined, NotificationsActiveOutlined, Visibility, VisibilityOff } from "@mui/icons-material";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import { useNotify } from "../context/NotificationContext";

const passwordError = (value) => !value ? "Password is required" : value.length < 8 ? "Use at least 8 characters" : !/[a-z]/.test(value) ? "Add a lowercase letter" : !/[A-Z]/.test(value) ? "Add an uppercase letter" : !/\d/.test(value) ? "Add a number" : !/[^A-Za-z0-9]/.test(value) ? "Add a symbol" : "";
const isValidTimezone = (value) => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } };
const accountDataExportEnabled = import.meta.env.VITE_ACCOUNT_DATA_EXPORT_ENABLED === "true";

export default function ProfilePage() {
    const { user, updateProfile, deleteAccount } = useContext(AuthContext);
    const navigate = useNavigate();
    const location = useLocation();
    const notify = useNotify();
    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const timezones = useMemo(() => {
        const supported = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
        return [...new Set([detectedTimezone, "Asia/Kolkata", "UTC", ...supported])].sort();
    }, [detectedTimezone]);

    const [name, setName] = useState("");
    const [language, setLanguage] = useState("cpp");
    const [saving, setSaving] = useState(false);
    const [practiceGoal, setPracticeGoal] = useState("confidence");
    const [targetRole, setTargetRole] = useState("");
    const [weeklyTarget, setWeeklyTarget] = useState(3);
    const [reminderEnabled, setReminderEnabled] = useState(false);
    const [reminderDay, setReminderDay] = useState("monday");
    const [reminderTime, setReminderTime] = useState("19:00");
    const [reminderTimezone, setReminderTimezone] = useState(detectedTimezone);
    const [testSending, setTestSending] = useState(false);
    const [passwordOpen, setPasswordOpen] = useState(false);
    const [passwordSaving, setPasswordSaving] = useState(false);
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleteText, setDeleteText] = useState("");
    const [deletePassword, setDeletePassword] = useState("");
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        setName(user?.name || "");
        setLanguage(user?.preferredProgrammingLanguage || "cpp");
        setPracticeGoal(user?.practiceGoal || "confidence");
        setTargetRole(user?.targetRole || "");
        setWeeklyTarget(user?.weeklyPracticeTarget || 3);
        setReminderEnabled(Boolean(user?.reminderEnabled));
        setReminderDay(user?.reminderDay || "monday");
        setReminderTime(user?.reminderTime || "19:00");
        setReminderTimezone(isValidTimezone(user?.reminderTimezone) ? user.reminderTimezone : detectedTimezone);
    }, [user, detectedTimezone]);

    useEffect(() => {
        if (location.hash !== "#target-role") return;
        requestAnimationFrame(() => {
            const field = document.getElementById("target-role");
            field?.scrollIntoView({ behavior: "smooth", block: "center" });
            field?.focus();
        });
    }, [location.hash]);

    const changed = name.trim() !== (user?.name || "")
        || language !== (user?.preferredProgrammingLanguage || "cpp")
        || practiceGoal !== (user?.practiceGoal || "confidence")
        || targetRole.trim() !== (user?.targetRole || "")
        || weeklyTarget !== (user?.weeklyPracticeTarget || 3)
        || reminderEnabled !== Boolean(user?.reminderEnabled)
        || reminderDay !== (user?.reminderDay || "monday")
        || reminderTime !== (user?.reminderTime || "19:00")
        || reminderTimezone !== (user?.reminderTimezone || detectedTimezone);

    const resetSettings = () => {
        setName(user?.name || "");
        setLanguage(user?.preferredProgrammingLanguage || "cpp");
        setPracticeGoal(user?.practiceGoal || "confidence");
        setTargetRole(user?.targetRole || "");
        setWeeklyTarget(user?.weeklyPracticeTarget || 3);
        setReminderEnabled(Boolean(user?.reminderEnabled));
        setReminderDay(user?.reminderDay || "monday");
        setReminderTime(user?.reminderTime || "19:00");
        setReminderTimezone(user?.reminderTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    };

    const closePassword = () => {
        if (passwordSaving) return;
        setPasswordOpen(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
    };
    const passwordInvalid = passwordError(newPassword);
    const mismatch = Boolean(confirmPassword && newPassword !== confirmPassword);

    return <Container maxWidth="md" sx={{ py: { xs: 3, md: 5 } }}>
        <Typography component="h1" variant="h3" fontWeight={850}>Profile</Typography>
        <Typography color="text.secondary" mt={1} mb={3}>Personalize your practice and manage your account.</Typography>

        <Card variant="outlined"><CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2.5} alignItems={{ xs: "stretch", sm: "center" }}>
                <Avatar sx={{ width: 64, height: 64, bgcolor: "primary.main", fontSize: 26 }}>{user?.name?.[0] || "U"}</Avatar>
                <TextField fullWidth label="Name" value={name} onChange={(e) => setName(e.target.value)} error={!name.trim()} helperText={!name.trim() ? "Name is required" : user?.email} />
            </Stack>
        </CardContent></Card>

        <Paper variant="outlined" sx={{ mt: 3, p: { xs: 2.5, sm: 3 } }}>
            <Stack spacing={2.5}>
                <Box>
                    <Typography component="h2" variant="h5" fontWeight={800}>Practice</Typography>
                    <Typography variant="body2" color="text.secondary" mt={.5}>Give Evalcue AI the minimum context it needs to tailor your interviews.</Typography>
                </Box>

                <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ p: 2, borderRadius: 2, bgcolor: "action.hover" }}>
                    <FlagOutlined color="primary" sx={{ flexShrink: 0, mt: .25 }} />
                    <Box flex={1} minWidth={0}>
                        <Typography fontWeight={800}>Target role</Typography>
                        <Typography variant="body2" color="text.secondary" mb={1.5}>Prefills new interviews, shapes recommendations, and anchors your weekly practice plan.</Typography>
                        <TextField id="target-role" label="Role you’re targeting" value={targetRole} onChange={(e) => setTargetRole(e.target.value)} placeholder="e.g. Senior Backend Engineer" fullWidth inputProps={{ maxLength: 120 }} />
                    </Box>
                </Stack>

                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                    <TextField fullWidth select label="Primary goal" value={practiceGoal} onChange={(e) => setPracticeGoal(e.target.value)}>{[["get-first-role","Land my first role"],["switch-role","Switch roles"],["promotion","Prepare for promotion"],["confidence","Build interview confidence"],["other","Another goal"]].map(([value,label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
                    <TextField fullWidth select label="Programming language" value={language} onChange={(e) => setLanguage(e.target.value)} helperText="Used when a weekly session includes coding.">{[["javascript","JavaScript"],["python","Python"],["cpp","C++"],["java","Java"]].map(([value,label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
                </Stack>
            </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ mt: 3, p: { xs: 2.5, sm: 3 } }}>
            <Stack spacing={2.25}>
                <Box>
                    <Typography component="h2" variant="h5" fontWeight={800}>Weekly Practice Plan</Typography>
                    <Typography variant="body2" color="text.secondary" mt={.5}>Choose how many tailored interview templates Evalcue AI should prepare for you each week.</Typography>
                </Box>

                <TextField select label="Sessions per week" value={weeklyTarget} onChange={(e) => setWeeklyTarget(Number(e.target.value))} helperText={`Your weekly email will contain ${weeklyTarget} separately crafted interview ${weeklyTarget === 1 ? "template" : "templates"}.`} fullWidth>
                    {[1,2,3,4,5,6,7].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
                </TextField>

                <Box sx={{ borderTop: 1, borderColor: "divider", pt: 2.25 }}>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ xs: "flex-start", sm: "center" }}>
                        <NotificationsActiveOutlined color="primary" sx={{ flexShrink: 0 }} />
                        <Box flex={1} minWidth={0}>
                            <Typography fontWeight={750}>Email my weekly plan</Typography>
                            <Typography variant="body2" color="text.secondary">Receive direct links to each pre-filled practice session at your preferred time.</Typography>
                        </Box>
                        <FormControlLabel control={<Switch checked={reminderEnabled} onChange={(e) => setReminderEnabled(e.target.checked)} />} label={reminderEnabled ? "On" : "Off"} />
                    </Stack>

                    {reminderEnabled && <Stack direction={{ xs: "column", sm: "row" }} spacing={2} mt={2}>
                        <TextField select label="Day" value={reminderDay} onChange={(e) => setReminderDay(e.target.value)} fullWidth>{["monday","tuesday","wednesday","thursday","friday","saturday","sunday"].map((day) => <MenuItem key={day} value={day}>{day[0].toUpperCase()+day.slice(1)}</MenuItem>)}</TextField>
                        <TextField label="Time" type="time" value={reminderTime} onChange={(e) => setReminderTime(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} />
                        <Autocomplete options={timezones} value={reminderTimezone} onChange={(_, value) => setReminderTimezone(value || detectedTimezone)} disableClearable fullWidth renderInput={(params) => <TextField {...params} label="Timezone" helperText={reminderTimezone === detectedTimezone ? "Detected timezone" : "Search by city or region"} />} />
                    </Stack>}

                    {reminderEnabled && <Alert severity={changed ? "info" : "success"} sx={{ mt: 2 }} action={!changed ? <Button color="inherit" size="small" disabled={testSending} onClick={async () => { try { setTestSending(true); await api.post("/auth/reminders/test"); notify("Test weekly plan sent. Check your inbox and spam folder.", "success"); } catch (e) { notify(e?.response?.data?.message || "Test weekly plan failed", "error"); } finally { setTestSending(false); } }}>{testSending ? "Sending…" : "Send test plan"}</Button> : undefined}>
                        {changed ? "Save changes to activate this weekly plan." : `${weeklyTarget} tailored session${weeklyTarget === 1 ? "" : "s"} will be sent every ${reminderDay.charAt(0).toUpperCase() + reminderDay.slice(1)} at ${reminderTime} (${reminderTimezone}).`}
                    </Alert>}
                </Box>
            </Stack>
        </Paper>

        <Stack direction="row" justifyContent="flex-end" spacing={1} mt={2}>
            <Button onClick={resetSettings} disabled={!changed || saving}>Discard</Button>
            <Button variant="contained" disabled={!changed || !name.trim() || saving} onClick={async () => {
                try {
                    setSaving(true);
                    await updateProfile({ name: name.trim(), preferredProgrammingLanguage: language, practiceGoal, targetRole: targetRole.trim(), weeklyPracticeTarget: weeklyTarget, reminderEnabled, reminderDay, reminderTime, reminderTimezone });
                    notify("Profile saved", "success");
                } catch (e) {
                    notify(e?.response?.data?.message || "Save failed", "error");
                } finally {
                    setSaving(false);
                }
            }}>{saving ? "Saving…" : "Save changes"}</Button>
        </Stack>

        <Typography component="h2" variant="h5" fontWeight={800} mt={4} mb={2}>Plan & billing</Typography>
        <Paper variant="outlined" sx={{ p: 2.5 }}><Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "stretch", sm: "center" }} spacing={2}><Box><Typography fontWeight={750}>{user?.practicePlan ? `Practice ${user.practicePlan.charAt(0).toUpperCase()}${user.practicePlan.slice(1)}` : "Your Practice plan"}</Typography><Typography variant="body2" color="text.secondary">Manage your personal Practice usage, invoices, upgrades, and cancellation.</Typography></Box><Button variant="outlined" onClick={() => navigate("/practice/pricing")}>Manage plan</Button></Stack></Paper>

        <Typography component="h2" variant="h5" fontWeight={800} mt={4} mb={2}>Security</Typography>
        <Paper variant="outlined" sx={{ p: 2.5 }}>{user?.provider === "local" ? <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "stretch", sm: "center" }} spacing={2}><Box><Typography fontWeight={750}>Password</Typography><Typography variant="body2" color="text.secondary">Use a unique password you do not use elsewhere.</Typography></Box><Button startIcon={<LockOutlined />} variant="outlined" onClick={() => setPasswordOpen(true)}>Change password</Button></Stack> : <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "stretch", sm: "center" }} spacing={2}><Box><Typography fontWeight={750}>Google sign-in</Typography><Typography variant="body2" color="text.secondary">Sign-in security is managed by your Google account.</Typography></Box><Button variant="outlined" disabled>Managed by Google</Button></Stack>}</Paper>

        {accountDataExportEnabled && <Paper variant="outlined" sx={{ mt: 4, p: 2.5 }}><Typography component="h2" variant="h6" fontWeight={800}>Your data</Typography><Typography color="text.secondary" my={1}>Download a JSON copy of your profile, practice interviews, reviews, saved experiences, feedback, and reminder history. Organization-owned Hiring data is not part of your personal export.</Typography><Button variant="outlined" onClick={async () => { try { const response = await api.get("/auth/export", { responseType: "blob" }); const url = URL.createObjectURL(response.data); const link = document.createElement("a"); link.href = url; link.download = `evalcue-export-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url); notify("Your data export was downloaded.", "success"); } catch (e) { notify(e?.response?.data?.message || "Export failed", "error"); } }}>Download my data</Button></Paper>}

        <Accordion variant="outlined" sx={{ mt: 3, borderColor: "error.light", borderRadius: "12px !important", "&:before": { display: "none" } }}><AccordionSummary expandIcon={<ExpandMoreRounded />} aria-controls="danger-zone-content"><Box><Typography component="h2" variant="h6" color="error.main" fontWeight={800}>Delete account</Typography><Typography variant="body2" color="text.secondary">Permanent account actions</Typography></Box></AccordionSummary><AccordionDetails id="danger-zone-content"><Typography color="text.secondary" mb={2}>Permanently delete your account and all associated data. This cannot be undone.</Typography><Button color="error" variant="outlined" onClick={() => setDeleteOpen(true)}>Delete account and data</Button></AccordionDetails></Accordion>

        <Dialog open={passwordOpen} onClose={closePassword} fullWidth maxWidth="xs" aria-labelledby="password-title"><DialogTitle id="password-title">Change password</DialogTitle><DialogContent><Stack spacing={2} mt={1}><TextField label="Current password" type={showCurrent ? "text" : "password"} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} InputProps={{ endAdornment: <InputAdornment position="end"><IconButton aria-label="Toggle current password visibility" onClick={() => setShowCurrent(v => !v)}>{showCurrent ? <VisibilityOff /> : <Visibility />}</IconButton></InputAdornment> }} /><TextField label="New password" type={showNew ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} error={Boolean(newPassword && passwordInvalid)} helperText={newPassword ? passwordInvalid || "Password meets requirements" : "8+ characters with upper, lower, number, and symbol"} InputProps={{ endAdornment: <InputAdornment position="end"><IconButton aria-label="Toggle new password visibility" onClick={() => setShowNew(v => !v)}>{showNew ? <VisibilityOff /> : <Visibility />}</IconButton></InputAdornment> }} /><TextField label="Confirm new password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} error={mismatch} helperText={mismatch ? "Passwords do not match" : ""} /></Stack></DialogContent><DialogActions><Button onClick={closePassword}>Cancel</Button><Button variant="contained" disabled={passwordSaving || !currentPassword || !newPassword || passwordInvalid || newPassword !== confirmPassword} onClick={async () => { try { setPasswordSaving(true); await updateProfile({ currentPassword, newPassword }); notify("Password changed", "success"); setPasswordOpen(false); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); } catch (e) { notify(e?.response?.data?.message || "Password change failed", "error"); } finally { setPasswordSaving(false); } }}>{passwordSaving ? "Changing…" : "Change password"}</Button></DialogActions></Dialog>
        <Dialog open={deleteOpen} onClose={() => !deleting && setDeleteOpen(false)} fullWidth maxWidth="xs" aria-labelledby="delete-account-title"><DialogTitle id="delete-account-title">Delete your account?</DialogTitle><DialogContent><Alert severity="warning" sx={{ mb: 2 }}>This cannot be undone.</Alert><Stack spacing={2}><TextField label="Type DELETE to confirm" value={deleteText} onChange={(e) => setDeleteText(e.target.value)} />{user?.provider === "local" && <TextField label="Current password" type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} />}</Stack></DialogContent><DialogActions><Button onClick={() => setDeleteOpen(false)}>Cancel</Button><Button color="error" variant="contained" disabled={deleting || deleteText !== "DELETE" || (user?.provider === "local" && !deletePassword)} onClick={async () => { try { setDeleting(true); await deleteAccount({ confirmation: deleteText, password: deletePassword || undefined }); navigate("/", { replace: true }); } catch (e) { notify(e?.response?.data?.message || "Deletion failed", "error"); } finally { setDeleting(false); } }}>Delete permanently</Button></DialogActions></Dialog>
    </Container>;
}
