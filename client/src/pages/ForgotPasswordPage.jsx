import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link as RouterLink, useLocation } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { Box, Card, CardContent, Link, Stack, Typography, TextField, Button, Alert } from "@mui/material";
import Captcha from "../components/Captcha";
import { getWorkspacePreference, setWorkspacePreference } from "../utils/workspacePreference";
import { productLoginPath, workspaceForSurface, surfaceForPath } from "../utils/productRoutes";
import { describeError } from "../utils/errorFormatter";

const ForgotPasswordPage = () => {
    const { forgotPassword } = useContext(AuthContext);
    const location = useLocation();
    const [email, setEmail] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [captchaToken, setCaptchaToken] = useState("");
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const captchaRef = useRef(null);

    const workspace = useMemo(() => {
        const params = new URLSearchParams(location.search);
        const requested = params.get("workspace");
        if (["practice", "hiring"].includes(requested)) return requested;
        return workspaceForSurface(surfaceForPath(location.state?.from?.pathname || "")) || getWorkspacePreference() || "practice";
    }, [location.search, location.state]);
    const loginPath = productLoginPath(workspace);
    const productName = workspace === "hiring" ? "Evalcue AI Hire" : "Evalcue AI Practice";

    useEffect(() => {
        setWorkspacePreference(workspace);
    }, [workspace]);

    const onSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setMessage("");
        setError("");
        try {
            const r = await forgotPassword(email, captchaToken, workspace);
            setMessage(r?.message || "If the email exists, a reset link has been sent.");
        } catch (e) {
            setError(describeError(e, "We couldn’t request a reset link. Try again."));
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
                        Forgot your password?
                    </Typography>
                    <Typography color="text.secondary" sx={{ mb: 3 }}>
                        Enter your registered email for {productName}. We’ll send you a reset link if the account exists and is verified.
                    </Typography>
                    <form onSubmit={onSubmit}>
                        <Stack spacing={2}>
                            <TextField
                                type="email"
                                label="Email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                            <Captcha ref={captchaRef} onVerify={(t) => setCaptchaToken(t)} onExpire={() => setCaptchaToken("")} />
                            <Button type="submit" variant="contained" disabled={submitting}>
                                {submitting ? "Sending…" : "Send reset link"}
                            </Button>
                            {message && <Alert severity="info">{message}</Alert>}
                            {error && <Alert severity="error">{error}</Alert>}
                            <Typography align="center" variant="body2">
                                <Link component={RouterLink} to={loginPath} underline="hover">
                                    Back to {workspace === "hiring" ? "Hire" : "Practice"} sign in
                                </Link>
                            </Typography>
                        </Stack>
                    </form>
                </CardContent>
            </Card>
        </Box>
    );
};

export default ForgotPasswordPage;
