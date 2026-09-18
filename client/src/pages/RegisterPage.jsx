import { useContext, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams, Link as RouterLink } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationContext";
import Captcha from "../components/Captcha";
import AuthShell from "../components/AuthShell";
import usePublicConfig from "../hooks/usePublicConfig";
import { getWorkspaceHome, getWorkspacePreference, setWorkspacePreference } from "../utils/workspacePreference";
import { productLoginPath, surfaceForPath, workspaceForSurface } from "../utils/productRoutes";
import { describeError } from "../utils/errorFormatter";

import {
    Alert,
    Box,
    Button,
    Checkbox,
    FormControl,
    FormControlLabel,
    FormHelperText,
    IconButton,
    InputAdornment,
    Link,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { PersonAddAlt1 as PersonAddIcon, Visibility, VisibilityOff } from "@mui/icons-material";

const RegisterPage = () => {
    const { register, googleLogin, resendVerification } = useContext(AuthContext);
    const { notify } = useNotifications();
    const publicConfig = usePublicConfig();
    const googleClientId = publicConfig?.google?.enabled ? publicConfig.google.clientId : "";
    const navigate = useNavigate();
    const location = useLocation();
    const [params] = useSearchParams();
    const requested = location.state?.from;
    const workspaceParam = params.get("workspace");
    const routeWorkspace = workspaceForSurface(surfaceForPath(location.pathname));
    const requestedWorkspace = routeWorkspace || (["practice", "hiring"].includes(workspaceParam) ? workspaceParam : null);
    const authSurface = requestedWorkspace || "combined";
    const productName = requestedWorkspace === "hiring" ? "Evalcue AI Hire" : requestedWorkspace === "practice" ? "Evalcue AI Practice" : "Evalcue AI";
    const requestedDestination = requested?.pathname
        ? `${requested.pathname}${requested.search || ""}${requested.hash || ""}`
        : null;

    useEffect(() => {
        if (requestedWorkspace) setWorkspacePreference(requestedWorkspace);
    }, [requestedWorkspace]);
    const loginPath = productLoginPath(requestedWorkspace);

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [gsiReady, setGsiReady] = useState(false);
    const [submittedEmail, setSubmittedEmail] = useState("");
    const googleDivRef = useRef(null);
    const captchaRef = useRef(null);
    const [captchaToken, setCaptchaToken] = useState("");
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [errors, setErrors] = useState({ name: "", email: "", password: "" });

    const passwordPolicyError = (pwd) => {
        if (!pwd) return "Password is required";
        if (pwd.length < 8) return "Password must be at least 8 characters";
        if (!/[a-z]/.test(pwd)) return "Password must include a lowercase letter";
        if (!/[A-Z]/.test(pwd)) return "Password must include an uppercase letter";
        if (!/\d/.test(pwd)) return "Password must include a digit";
        if (!/[^A-Za-z0-9]/.test(pwd)) return "Password must include a special character";
        return "";
    };

    const validate = () => {
        const next = { name: "", email: "", password: "" };
        if (!name.trim()) next.name = "Name is required";
        if (!email) next.email = "Email is required";
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (email && !emailPattern.test(email)) next.email = "Enter a valid email";
        const pwdErr = passwordPolicyError(password);
        if (pwdErr) next.password = pwdErr;
        setErrors(next);
        return !next.name && !next.email && !next.password;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate() || !acceptedTerms) return;
        setSubmitting(true);
        try {
            const resp = await register(name.trim(), email, password, captchaToken);
            setSubmittedEmail(email);
            notify(resp?.message || "Verification email sent. Please check your inbox.", "success");
        } catch (err) {
            const apiMsg = describeError(err, "");
            const apiDetails = err?.response?.data?.details;
            let pwdError = "";
            if (Array.isArray(apiDetails)) {
                const pwdIssues = apiDetails.filter((d) => String(d?.path || "").includes("password"));
                if (pwdIssues.length > 0) pwdError = pwdIssues.map((d) => d?.message).filter(Boolean).join(". ");
            }
            if (apiMsg && apiMsg !== "User already exists" && !pwdError) notify(apiMsg, "error");
            setErrors((prev) => ({
                ...prev,
                email: apiMsg === "User already exists" ? "Email already registered" : prev.email,
                password: pwdError || prev.password,
            }));
        } finally {
            setCaptchaToken("");
            captchaRef.current?.reset();
            setSubmitting(false);
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

    useEffect(() => {
        if (!acceptedTerms || !googleClientId || !gsiReady || !googleDivRef.current || !window.google?.accounts?.id) return;
        try {
            window.google.accounts.id.initialize({
                client_id: googleClientId,
                callback: async (response) => {
                    try {
                        const authenticatedUser = await googleLogin(response.credential, { termsAccepted: true });
                        const workspace = requestedWorkspace || getWorkspacePreference(authenticatedUser?._id) || "practice";
                        navigate(requestedDestination || getWorkspaceHome(workspace), { replace: true });
                    } catch (error) {
                        notify(describeError(error, "Google sign-up failed"), "error");
                    }
                },
                auto_select: false,
                ux_mode: "popup",
                use_fedcm_for_button: true,
                itp_support: true,
            });
            googleDivRef.current.innerHTML = "";
            window.google.accounts.id.renderButton(googleDivRef.current, { theme: "filled_blue", size: "large", shape: "pill", text: "signup_with" });
        } catch (error) {
            console.warn("Google button init failed", error);
        }
    }, [acceptedTerms, googleClientId, gsiReady, googleLogin, navigate, notify, requestedDestination, requestedWorkspace]);

    const authState = requested ? { from: requested } : undefined;

    return (
        <AuthShell
            surface={authSurface}
            eyebrow="Get started"
            title={`Create your ${productName} account`}
            subtitle={requestedWorkspace === "hiring" ? "Start an organization-owned hiring workspace for assessments, candidates, reports, and team access." : requestedWorkspace === "practice" ? "Create your private interview-preparation workspace and start practicing against your target role." : "Create one account, then use the Practice or Hire product you need."}
        >
            <Box component="form" noValidate onSubmit={handleSubmit}>
                <Stack spacing={{ xs: 2.25, md: 1.35 }}>
                    <FormControl fullWidth><TextField id="name" label="Name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Jane Doe" autoComplete="name" error={!!errors.name} helperText={errors.name || undefined} size="medium" /></FormControl>
                    <FormControl fullWidth><TextField id="email" label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@example.com" autoComplete="email" error={!!errors.email} helperText={errors.email || undefined} size="medium" /></FormControl>
                    <FormControl fullWidth>
                        <TextField id="password" label="Password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" autoComplete="new-password" error={!!errors.password} size="medium" InputProps={{ endAdornment: <InputAdornment position="end"><IconButton aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((s) => !s)} edge="end">{showPassword ? <VisibilityOff /> : <Visibility />}</IconButton></InputAdornment> }} />
                        {errors.password && <FormHelperText error>{errors.password}</FormHelperText>}
                        {password && <Stack spacing={0.25} mt={0.5}>{[
                            { label: "8+ characters", ok: password.length >= 8 },
                            { label: "Lowercase letter", ok: /[a-z]/.test(password) },
                            { label: "Uppercase letter", ok: /[A-Z]/.test(password) },
                            { label: "Number", ok: /\d/.test(password) },
                            { label: "Special character", ok: /[^A-Za-z0-9]/.test(password) },
                        ].map(({ label, ok }) => <Typography key={label} variant="caption" color={ok ? "success.main" : "text.disabled"}>{ok ? "✓" : "○"} {label}</Typography>)}</Stack>}
                    </FormControl>
                    <Captcha ref={captchaRef} enabled={Boolean(publicConfig?.captcha?.registerEnabled)} onVerify={(t) => setCaptchaToken(t)} onExpire={() => setCaptchaToken("")} />
                    <FormControlLabel control={<Checkbox checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} />} label={<Typography variant="body2">I agree to the <Link component={RouterLink} to="/terms">Terms</Link> and acknowledge the <Link component={RouterLink} to="/privacy">Privacy Notice</Link>.</Typography>} />
                    <Button type="submit" variant="contained" size="large" startIcon={<PersonAddIcon />} disabled={submitting || !acceptedTerms} sx={{ py: 1.25, borderRadius: 2, textTransform: "none", fontWeight: 700 }}>{submitting ? "Creating account..." : requestedWorkspace === "hiring" ? "Create hiring account" : requestedWorkspace === "practice" ? "Create practice account" : "Create account"}</Button>
                    {acceptedTerms && googleClientId && <Stack spacing={2} alignItems="center"><div ref={googleDivRef} /><Typography variant="caption" color="text.secondary" align="center">Google sign-up may not display in embedded browsers. If the Google window is blank, open Evalcue AI in Chrome or Safari, or create your account with email.</Typography></Stack>}
                    {submittedEmail && <Stack spacing={1} alignItems="center"><Typography variant="body2" color="text.secondary">Didn’t get the email? Check spam or resend.</Typography><Button variant="text" onClick={async () => { try { const r = await resendVerification(submittedEmail); notify(r?.message || "Verification email re-sent", "success"); } catch (e) { notify(describeError(e, "Could not resend verification email."), "error"); } }}>Resend verification</Button><Button component={RouterLink} to={loginPath} state={authState} size="small">Continue to sign in</Button></Stack>}
                </Stack>
            </Box>
            <Typography align="center" color="text.secondary" sx={{ mt: { xs: 4, md: 2 } }}>Already have an account? <Link component={RouterLink} to={loginPath} state={authState} underline="hover">Login</Link></Typography>
        </AuthShell>
    );
};

export default RegisterPage;
