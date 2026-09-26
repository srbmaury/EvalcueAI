import { Link as RouterLink } from "react-router-dom";
import { Alert, Box, Button, Checkbox, Chip, CircularProgress, FormControlLabel, Link, Paper, Stack, TextField, Typography } from "@mui/material";
import { CheckCircleOutlineRounded, ErrorOutlineRounded } from "@mui/icons-material";
import Captcha from "./Captcha";
import { formatAssessmentDateTime } from "../utils/hiringAssessmentPayload";

const Ready = ({ label }) => <Chip icon={<CheckCircleOutlineRounded />} color="success" variant="outlined" label={label} />;

// Landing screen of a candidate assessment: what to expect, device checks, identity, consent and start.
export default function CandidateAssessmentStart({
    assessment, plannedUnits, error, busy, onStart,
    online, supportsSTT, micReady, onCheckMicrophone, cameraReady, onCheckCamera,
    identity, onIdentityChange, emailLocked,
    consent, onConsentChange, integrityConsent, onIntegrityConsentChange,
    captchaEnabled, captchaToken, onCaptchaToken,
}) {
    const integrity = assessment.integrity || {};
    const canStart = !busy && online && consent && (!captchaEnabled || captchaToken) && (!integrity.enabled || integrityConsent) && (!integrity.requireCamera || cameraReady);
    return (
        <>
            <Typography variant="overline" color="primary" fontWeight={800}>{assessment.organizationName || "Candidate assessment"}</Typography>
            <Typography component="h1" variant="h3" sx={{ fontSize: { xs: "2.35rem", sm: "3rem" } }} fontWeight={850}>{assessment.title}</Typography>
            <Typography color="text.secondary" mt={1}>{assessment.jobRole} · up to {plannedUnits} {plannedUnits === 1 ? "question" : "questions"} · about {assessment.durationMinutes || 30} minutes</Typography>
            {assessment.expiresAt && <Typography variant="body2" color="text.secondary" mt={1}>Submit by {formatAssessmentDateTime(assessment.expiresAt, assessment.timezone || "UTC")}</Typography>}
            {assessment.candidateInstructions && <Alert severity="info" sx={{ mt: 3 }}>{assessment.candidateInstructions}</Alert>}
            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

            <Paper component="form" onSubmit={onStart} variant="outlined" sx={{ p: { xs: 2, md: 4 }, mt: 3, maxWidth: 900 }}>
                <Typography component="h2" variant="h5" fontWeight={800}>Before you begin</Typography>
                <Typography color="text.secondary" mt={1} mb={3}>Check your device once, confirm your identity, and start. There is no interviewer configuration step.</Typography>
                <Stack spacing={2}>
                    <Paper variant="outlined" sx={{ p: 2 }}>
                        <Typography fontWeight={800}>Device readiness</Typography>
                        <Typography variant="body2" color="text.secondary" mb={1.5}>Voice is optional unless the interview instructions say otherwise. You can always type.</Typography>
                        <Stack direction={{ xs: "column", sm: "row" }} gap={1} flexWrap="wrap">
                            <Chip icon={online ? <CheckCircleOutlineRounded /> : <ErrorOutlineRounded />} color={online ? "success" : "error"} variant="outlined" label={online ? "Internet connected" : "Offline"} />
                            <Chip icon={supportsSTT ? <CheckCircleOutlineRounded /> : <ErrorOutlineRounded />} color={supportsSTT ? "success" : "default"} variant="outlined" label={supportsSTT ? "Voice input supported" : "Typing available"} />
                            {micReady ? <Ready label="Microphone ready" /> : <Button type="button" size="small" variant="outlined" onClick={onCheckMicrophone}>Check microphone</Button>}
                            {integrity.requireCamera && (cameraReady ? <Ready label="Camera ready" /> : <Button type="button" size="small" variant="outlined" onClick={onCheckCamera}>Check camera</Button>)}
                        </Stack>
                    </Paper>
                    <TextField required label="Full name" value={identity.name} onChange={(event) => onIdentityChange({ ...identity, name: event.target.value })} />
                    <TextField required type="email" label="Email address" value={identity.email} disabled={emailLocked} helperText={emailLocked ? "Prefilled from your invitation" : ""} onChange={(event) => onIdentityChange({ ...identity, email: event.target.value })} />
                    <FormControlLabel control={<Checkbox required checked={consent} onChange={(event) => onConsentChange(event.target.checked)} />} label={<span>I understand how my assessment data is processed and shared. <Link component={RouterLink} to="/privacy" target="_blank">Privacy notice</Link></span>} />
                    {integrity.enabled && (
                        <Alert severity="warning">
                            <Typography fontWeight={750}>Integrity signals are enabled</Typography>
                            <Typography variant="body2">The recruiting team may review tab visibility, window focus, fullscreen, clipboard, connectivity{integrity.monitorFacePresence ? ", and sustained face-presence" : ""} events. Camera frames stay in your browser and are not saved or uploaded. These signals are context—not automatic cheating findings—and are retained for {integrity.retentionDays || 30} days.</Typography>
                            <FormControlLabel control={<Checkbox required checked={integrityConsent} onChange={(event) => onIntegrityConsentChange(event.target.checked)} />} label="I consent to these integrity signals" />
                        </Alert>
                    )}
                    {assessment.contactEmail && <Typography variant="body2" color="text.secondary">Need an accommodation or technical help? Contact <Link href={`mailto:${assessment.contactEmail}`}>{assessment.contactEmail}</Link>.</Typography>}
                    <Captcha enabled={captchaEnabled} onVerify={onCaptchaToken} onExpire={() => onCaptchaToken("")} />
                    <Box><Button type="submit" variant="contained" disabled={!canStart}>{busy ? <CircularProgress size={22} color="inherit" /> : "Start assessment"}</Button></Box>
                </Stack>
            </Paper>
        </>
    );
}
