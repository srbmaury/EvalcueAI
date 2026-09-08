import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from "@mui/material";

export default function ConfirmActionDialog({
    open,
    title,
    body,
    warning,
    confirmLabel = "Confirm",
    confirmColor = "primary",
    confirming = false,
    onCancel,
    onConfirm,
}) {
    return (
        <Dialog open={Boolean(open)} onClose={() => !confirming && onCancel?.()} fullWidth maxWidth="xs" aria-labelledby="confirm-action-title">
            <DialogTitle id="confirm-action-title">{title}</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2}>
                    {body && <Typography color="text.secondary">{body}</Typography>}
                    {warning && <Alert severity="warning">{warning}</Alert>}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button disabled={confirming} onClick={onCancel}>Cancel</Button>
                <Button variant="contained" color={confirmColor} disabled={confirming} onClick={onConfirm}>{confirming ? "Working…" : confirmLabel}</Button>
            </DialogActions>
        </Dialog>
    );
}
