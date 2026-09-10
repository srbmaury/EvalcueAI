import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { Box, Card, CardContent, Stack, Typography, TextField, Button, Alert, InputAdornment, IconButton } from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import Captcha from "../components/Captcha";
import { getWorkspacePreference, setWorkspacePreference } from "../utils/workspacePreference";
import { productLoginPath } from "../utils/productRoutes";

const useQuery = () => new URLSearchParams(useLocation().search);

const ResetPasswordPage = () => {
    const { resetPassword } = useContext(AuthContext);
    const navigate = useNavigate();
    const query = useQuery();
    const token = query.get("token") || "";
    const email = query.get("email") || "";
    const workspaceParam = query.get("workspace") || "";
    const workspace = ["practice", "hiring"].includes(workspaceParam) ? workspaceParam : getWorkspacePreference() || "practice";
    const loginPath = productLoginPath(workspace);
    const forgotPath = `/forgot-password?workspace=${workspace}`;

    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [captchaToken, setCaptchaToken] = useState("");
    const captchaRef = useRef(null);

    useEffect(() => {
        setWorkspacePreference(workspace);
    }, [workspace]);

    const passwordPolicyError = (pwd) => {
        if (!pwd) return "Password is required";
        if (pwd.length < 8) return "Password must be at least 8 characters";
        if (!/[a-z]/.test(pwd)) return "Must include a lowercase letter";
        if (!/[A-Z]/.test(pwd)) return "Must include an uppercase letter";
        if (!/\d/.test(pwd)) return "Must include a digit";
        if (!/[^A-Za-z0-9]/.test(pwd)) return "Must include a special character";
        return "";
    };

    const disabled = useMemo(() => {
        if (!newPassword) return true;
        if (passwordPolicyError(newPassword)) return true;
        if (newPassword !== confirmPassword) return true;
        return submitting;
    }, [newPassword, confirmPassword, submitting]);

    const hasValidLink = Boolean(token && email);

    const onSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setMessage("");
        setError("");
        try {
            const r = await resetPassword({ token, email, newPassword, captchaToken, workspace });
            setMessage(r?.message || "Password updated");
            setTimeout(() => navigate(loginPath), 1200);
        } catch (e) {
            setError(e?.response?.data?.message || "We couldn’t reset your password. Request a new link and try again.");
        } finally {
            setCaptchaToken("");
            captchaRef.current?.reset();
            setSubmitting(false);
        }
    };

    return (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6, px: 2 }}>
            <Card sx={{ maxWidth: 520, width: "100%" }}>
                <CardContent sx={{ p: { xs: 3, sm: 5 } }}>
                    <Typography component="h1" variant="h5" fontWeight={700} gutterBottom>
                        Reset your password
                    </Typography>
                    {!hasValidLink ? (
                        <Stack spacing={2}>
                            <Alert severity="error">Invalid or incomplete password reset link.</Alert>
                            <Button variant="contained" onClick={() => navigate(forgotPath)}>
                                Request a new reset link
                            </Button>
                        </Stack>
                    ) : (
                    <>
                        <Typography color="text.secondary" sx={{ mb: 3 }}>
                            Set a new password for {email}. You’ll return to {workspace === "hiring" ? "Hire" : "Practice"} sign in after this succeeds.
                        </Typography>
                        <form onSubmit={onSubmit}>
                        <Stack spacing={2}>
                            <TextField
                                label="New password"
                                type={showNew ? "text" : "password"}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                                helperText={newPassword ? (passwordPolicyError(newPassword) || " ") : " "}
                                error={!!newPassword && !!passwordPolicyError(newPassword)}
                                InputProps={{
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <IconButton onClick={() => setShowNew((s) => !s)} edge="end" aria-label="toggle new password visibility">
                                                {showNew ? <VisibilityOff /> : <Visibility />}
                                            </IconButton>
                                        </InputAdornment>
                                    ),
                                }}
                            />
                            <TextField
                                label="Confirm new password"
                                type={showConfirm ? "text" : "password"}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                helperText={confirmPassword && confirmPassword !== newPassword ? "Passwords do not match" : " "}
                                error={!!confirmPassword && confirmPassword !== newPassword}
                                InputProps={{
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <IconButton onClick={() => setShowConfirm((s) => !s)} edge="end" aria-label="toggle confirm password visibility">
                                                {showConfirm ? <VisibilityOff /> : <Visibility />}
                                            </IconButton>
                                        </InputAdornment>
                                    ),
                                }}
                            />
                            <Captcha ref={captchaRef} onVerify={(t) => setCaptchaToken(t)} onExpire={() => setCaptchaToken("")} />
                            <Button type="submit" variant="contained" disabled={disabled}>
                                {submitting ? "Saving…" : "Set new password"}
                            </Button>
                            {message && <Alert severity="success">{message}</Alert>}
                            {error && <Alert severity="error">{error}</Alert>}
                        </Stack>
                        </form>
                    </>
                    )}
                </CardContent>
            </Card>
        </Box>
    );
};

export default ResetPasswordPage;
