import { useContext, useEffect, useState } from "react";
import { useSearchParams, Link as RouterLink, useNavigate } from "react-router-dom";
import { Box, Card, CardContent, Typography, Button, CircularProgress, Stack, Link } from "@mui/material";
import api from "../api/axios";
import { AuthContext } from "../context/AuthContext";
import { getWorkspacePreference } from "../utils/workspacePreference";
import { describeError } from "../utils/errorFormatter";

const VerifyEmailPage = () => {
    const { resendVerification } = useContext(AuthContext);
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const token = params.get("token");
    const email = params.get("email");
    const workspaceParam = params.get("workspace");
    const requestedWorkspace = ["practice", "hiring"].includes(workspaceParam) ? workspaceParam : getWorkspacePreference();
    const loginPath = requestedWorkspace === "hiring" ? "/login?workspace=hiring" : requestedWorkspace === "practice" ? "/login?workspace=practice" : "/login";
    const [status, setStatus] = useState("idle");
    const [message, setMessage] = useState("");
    const [resendMsg, setResendMsg] = useState("");

    useEffect(() => {
        const verify = async () => {
            if (!token || !email) {
                setStatus("error");
                setMessage("Invalid verification link");
                return;
            }
            setStatus("verifying");
            try {
                const { data } = await api.post(`/auth/verify-email`, { token, email });
                setStatus("success");
                setMessage(data?.message || "Email verified.");
            } catch (e) {
                const msg = describeError(e, "Could not verify email.");
                setStatus("error");
                setMessage(msg);
            }
        };
        verify();
    }, [token, email]);

    const handleGoLogin = () => navigate(loginPath);

    return (
        <Box sx={{ minHeight: { xs: "calc(100dvh - 65px)", md: "calc(100dvh - 73px)" }, display: "flex", alignItems: "center", justifyContent: "center", px: 2, py: 3 }}>
            <Card sx={{ maxWidth: 640, width: "100%", borderRadius: 3 }}>
                <CardContent sx={{ p: { xs: 3, sm: 5 } }}>
                    <Typography component="h1" variant="h4" fontWeight={700} gutterBottom>Verify your email</Typography>
                    <Stack alignItems="center" spacing={3} sx={{ mt: 2 }}>
                        {status === "verifying" && <><CircularProgress /><Typography>Verifying your email…</Typography></>}
                        {(status === "success" || status === "error") && <>
                            <Typography color={status === "error" ? "error" : "primary"}>{message}</Typography>
                            <Button variant="contained" onClick={handleGoLogin}>Go to sign in</Button>
                            {status === "error" && <Stack spacing={1} alignItems="center">
                                {email && <Button variant="outlined" size="small" onClick={async () => { try { const r = await resendVerification(email); setResendMsg(r?.message || "Verification email sent — check your inbox."); } catch { setResendMsg("Could not resend — try registering again."); } }}>Resend verification email</Button>}
                                {resendMsg && <Typography variant="body2" color="text.secondary">{resendMsg}</Typography>}
                                <Typography variant="body2" color="text.secondary">No account yet? <Link component={RouterLink} to={requestedWorkspace ? `/register?workspace=${requestedWorkspace}` : "/register"}>Register</Link></Typography>
                            </Stack>}
                        </>}
                    </Stack>
                </CardContent>
            </Card>
        </Box>
    );
};

export default VerifyEmailPage;
