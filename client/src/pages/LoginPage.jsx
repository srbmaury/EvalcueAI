import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, Link as RouterLink } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import Captcha from "../components/Captcha";
import AuthShell from "../components/AuthShell";
import usePublicConfig from "../hooks/usePublicConfig";
import { getWorkspaceHome, getWorkspacePreference, setWorkspacePreference } from "../utils/workspacePreference";
import { productRegisterPath, surfaceForPath, workspaceForSurface } from "../utils/productRoutes";
import { isEmbeddedBrowser } from "../utils/embeddedBrowser";
import { describeError } from "../utils/errorFormatter";

import {
    Alert,
    Box,
    Button,
    Divider,
    FormControl,
    FormHelperText,
    IconButton,
    InputAdornment,
    Link,
    Stack,
    TextField,
    Typography,
} from "@mui/material";

import { BusinessRounded, Login as LoginIcon, Visibility, VisibilityOff } from "@mui/icons-material";

const LoginPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const publicConfig = usePublicConfig();
    const googleClientId = publicConfig?.google?.enabled ? publicConfig.google.clientId : "";
    const { login, googleLogin, startSsoLogin, resendVerification } = useContext(AuthContext);

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [ssoSubmitting, setSsoSubmitting] = useState(false);
    const [captchaToken, setCaptchaToken] = useState("");
    const [gsiReady, setGsiReady] = useState(false);
    const googleDivRef = useRef(null);
    const captchaRef = useRef(null);

    const [errors, setErrors] = useState({ email: "", password: "" });
    const [apiError, setApiError] = useState("");
    const requested = location.state?.from;
    const workspaceParam = new URLSearchParams(location.search).get("workspace");
    const routeWorkspace = workspaceForSurface(surfaceForPath(location.pathname));
    const requestedWorkspace = routeWorkspace || (["practice", "hiring"].includes(workspaceParam) ? workspaceParam : null);
    const authSurface = requestedWorkspace || "combined";
    const productName = requestedWorkspace === "hiring" ? "EvalcueAI Hire" : requestedWorkspace === "practice" ? "EvalcueAI Practice" : "EvalcueAI";
    const showWorkSso = requestedWorkspace !== "practice";

    useEffect(() => {
        if (requestedWorkspace) setWorkspacePreference(requestedWorkspace);
    }, [requestedWorkspace]);

    const requestedDestination = requested?.pathname
        ? `${requested.pathname}${requested.search || ""}${requested.hash || ""}`
        : null;
    const authenticatedDestinationFor = useCallback((authenticatedUser) => (
        requestedDestination || getWorkspaceHome(
            requestedWorkspace || getWorkspacePreference(authenticatedUser?._id) || "practice"
        )
    ), [requestedDestination, requestedWorkspace]);
    const registerPath = productRegisterPath(requestedWorkspace);
    const forgotPasswordPath = `/forgot-password?workspace=${requestedWorkspace || getWorkspacePreference() || "practice"}`;

    const validate = () => {
        const next = { email: "", password: "" };
        if (!email) next.email = "Email is required";
        if (!password) next.password = "Password is required";
        setErrors(next);
        return !next.email && !next.password;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate()) return;
        setApiError("");
        setSubmitting(true);
        try {
            const authenticatedUser = await login(email, password, captchaToken);
            navigate(authenticatedDestinationFor(authenticatedUser), { replace: true });
        } catch (err) {
            const msg = describeError(err, "Invalid credentials");
            if (msg === "Email not verified") {
                setErrors((prev) => ({ ...prev, password: msg }));
            } else {
                setApiError(msg);
            }
        } finally {
            setCaptchaToken("");
            captchaRef.current?.reset();
            setSubmitting(false);
        }
    };

    const handleSso = async () => {
        const trimmedEmail = email.trim();
        if (!trimmedEmail) {
            setErrors((current) => ({ ...current, email: "Enter your work email to use SSO" }));
            return;
        }
        setApiError("");
        setSsoSubmitting(true);
        try {
            const result = await startSsoLogin(trimmedEmail);
            if (!result?.authorizationUrl) throw new Error("Missing SSO authorization URL");
            setWorkspacePreference("hiring");
            window.location.assign(result.authorizationUrl);
        } catch (err) {
            setApiError(err?.response?.data?.message || "Work SSO is not configured for this email.");
            setSsoSubmitting(false);
        }
    };

    useEffect(() => {
        setGsiReady(false);
        if (!googleClientId) return undefined;
        if (window.google?.accounts?.id) {
            setGsiReady(true);
            return undefined;
        }
        let script = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
        const onLoad = () => setGsiReady(true);
        if (!script) {
            script = document.createElement("script");
            script.src = "https://accounts.google.com/gsi/client";
            script.async = true;
            script.defer = true;
            document.head.appendChild(script);
        }
        script.addEventListener("load", onLoad);
        return () => script?.removeEventListener("load", onLoad);
    }, [googleClientId]);

    const googleLoginRef = useRef(googleLogin);
    useEffect(() => { googleLoginRef.current = googleLogin; }, [googleLogin]);

    useEffect(() => {
        if (!googleClientId || !gsiReady || !googleDivRef.current || !window.google?.accounts?.id) return;
        try {
            window.google.accounts.id.initialize({
                client_id: googleClientId,
                callback: async (response) => {
                    try {
                        setApiError("");
                        const authenticatedUser = await googleLoginRef.current(response.credential);
                        navigate(authenticatedDestinationFor(authenticatedUser), { replace: true });
                    } catch (error) {
                        setApiError(error?.response?.data?.message || "Google sign-in failed");
                    }
                },
                auto_select: false,
                ux_mode: "popup",
                use_fedcm_for_button: true,
                itp_support: true,
            });
            googleDivRef.current.innerHTML = "";
            window.google.accounts.id.renderButton(googleDivRef.current, {
                theme: "filled_blue",
                size: "large",
                shape: "pill",
                text: "signin_with",
            });
        } catch (error) {
            console.error("GIS button render error", error);
        }
    }, [authenticatedDestinationFor, googleClientId, gsiReady, navigate]);

    return (
        <AuthShell
            surface={authSurface}
            eyebrow="Welcome back"
            title={`Sign in to ${productName}`}
            subtitle={requestedWorkspace === "hiring" ? "Continue to your organization’s assessments, candidate evidence, and hiring reports." : requestedWorkspace === "practice" ? "Continue your private interview preparation and progress." : "Choose the product you were using and continue where you left off."}
        >
            {(googleClientId || showWorkSso) && <>
                <Stack spacing={1.5} alignItems="center">
                    {googleClientId && <div ref={googleDivRef} />}
                    {showWorkSso && <Button fullWidth variant="outlined" size="large" startIcon={<BusinessRounded />} disabled={ssoSubmitting || submitting} onClick={handleSso}>{ssoSubmitting ? "Opening your identity provider…" : "Continue with work SSO"}</Button>}
                    {(showWorkSso || (googleClientId && isEmbeddedBrowser())) && <Typography variant="caption" color="text.secondary" align="center">{showWorkSso ? "Work SSO is available for EvalcueAI Hire organizations. " : ""}{googleClientId && isEmbeddedBrowser() ? "Google sign-in may not display in in-app browsers; use Chrome or Safari if needed." : ""}</Typography>}
                </Stack>
                <Divider sx={{ my: { xs: 2.5, md: 1.75 } }}><Typography variant="caption" color="text.secondary">or sign in with email</Typography></Divider>
            </>}
            <Box component="form" noValidate onSubmit={handleSubmit}>
                <Stack spacing={{ xs: 2.25, md: 1.5 }}>
                    {apiError && <Alert severity="error" onClose={() => setApiError("")}>{apiError}</Alert>}
                    <FormControl fullWidth>
                        <TextField id="email" label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@example.com" autoComplete="email" error={!!errors.email} helperText={errors.email || undefined} size="medium" />
                    </FormControl>
                    <FormControl fullWidth>
                        <TextField id="password" label="Password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" autoComplete="current-password" error={!!errors.password} size="medium" InputProps={{ endAdornment: <InputAdornment position="end"><IconButton aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((s) => !s)} edge="end">{showPassword ? <VisibilityOff /> : <Visibility />}</IconButton></InputAdornment> }} />
                        {errors.password && <FormHelperText error>{errors.password}</FormHelperText>}
                        <Typography variant="body2" align="right" sx={{ mt: 1 }}><Link component={RouterLink} to={forgotPasswordPath} underline="hover">Forgot password?</Link></Typography>
                    </FormControl>
                    {errors.password === "Email not verified" && <Stack spacing={1}><Typography variant="body2" color="text.secondary">Didn’t receive the verification email?</Typography><Button size="small" variant="text" onClick={async () => { try { const r = await resendVerification(email); setErrors((p) => ({ ...p, password: r?.message || "Verification email sent" })); } catch (e) { console.error(e); } }}>Resend verification</Button></Stack>}
                    <Captcha ref={captchaRef} enabled={Boolean(publicConfig?.captcha?.loginEnabled)} onVerify={(t) => setCaptchaToken(t)} onExpire={() => setCaptchaToken("")} />
                    <Button type="submit" variant="contained" size="large" startIcon={<LoginIcon />} disabled={submitting || ssoSubmitting} sx={{ py: 1.25, borderRadius: 2, textTransform: "none", fontWeight: 700 }}>{submitting ? "Signing in..." : "Sign in"}</Button>
                </Stack>
            </Box>
            <Typography align="center" color="text.secondary" sx={{ mt: { xs: 3, md: 2 } }}>Don’t have an account? <Link component={RouterLink} to={registerPath} state={requested ? { from: requested } : undefined} underline="always">Register</Link></Typography>
        </AuthShell>
    );
};

export default LoginPage;
