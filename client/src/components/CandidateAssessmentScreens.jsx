import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Typography } from "@mui/material";

// Small full-panel states of a candidate assessment in progress.

const CenteredPanel = ({ minHeight, children }) => (
    <Paper variant="outlined" sx={{ p: { xs: 3, md: 5 }, minHeight, display: "grid", alignContent: "center", borderRadius: 3 }}>
        <Stack spacing={2} alignItems="flex-start">{children}</Stack>
    </Paper>
);

export const IntegrityRecoveryPanel = ({ reason, onEnterFullscreen, onRestoreCamera }) => (
    <CenteredPanel minHeight={320}>
        <Typography component="h2" variant="h5" fontWeight={850}>Restore required assessment conditions</Typography>
        <Alert severity="warning">{reason === "fullscreen" ? "Fullscreen is required to continue this assessment." : "Camera access is required to continue this assessment."}</Alert>
        {reason === "fullscreen"
            ? <Button variant="contained" onClick={onEnterFullscreen}>Enter fullscreen</Button>
            : <Button variant="contained" onClick={onRestoreCamera}>Restore camera</Button>}
    </CenteredPanel>
);

export const RoundTransitionPanel = ({ transition, nextRoundName, onContinue }) => (
    <CenteredPanel minHeight={340}>
        <Typography variant="overline" color="primary.main" fontWeight={800}>Interviewer</Typography>
        <Typography component="h2" variant="h4" fontWeight={850}>{transition.title}</Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 680 }}>{transition.message}</Typography>
        <Button variant="contained" onClick={onContinue}>{transition.nextRoundIndex != null ? `Continue to ${nextRoundName || "next round"}` : "Review and submit"}</Button>
    </CenteredPanel>
);

export const InterviewCompleteCard = ({ roundCount, busy, onReview }) => (
    <Paper id="assessment-submit" variant="outlined" sx={{ mt: 2, p: { xs: 2.5, md: 3 }, borderRadius: 3 }}>
        <Typography component="h2" variant="h5" fontWeight={850}>Interview complete</Typography>
        <Typography color="text.secondary" mt={.5}>All {roundCount} rounds are complete and your responses are saved. Detailed evaluation is generated only after submission.</Typography>
        <Button variant="contained" sx={{ mt: 2 }} disabled={busy} onClick={onReview}>Review and submit</Button>
    </Paper>
);

export const SubmitConfirmDialog = ({ open, roundCount, busy, onClose, onSubmit }) => (
    <Dialog open={open} onClose={() => !busy && onClose()} aria-labelledby="candidate-submit-title" maxWidth="sm" fullWidth>
        <DialogTitle id="candidate-submit-title">Ready to submit?</DialogTitle>
        <DialogContent>
            <Stack spacing={1.5}>
                <Typography>{roundCount} of {roundCount} rounds completed.</Typography>
                <Alert severity="info">Your responses are saved. After submission, you won’t be able to change them.</Alert>
            </Stack>
        </DialogContent>
        <DialogActions>
            <Button disabled={busy} onClick={onClose}>Keep reviewing</Button>
            <Button variant="contained" disabled={busy} onClick={onSubmit}>{busy ? "Submitting…" : "Submit assessment"}</Button>
        </DialogActions>
    </Dialog>
);
