import { useState } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from "@mui/material";

const SkipRoundButton = ({ onSkip, disabled = false }) => {
    const [open, setOpen] = useState(false);

    return (
        <>
            <Button color="error" variant="outlined" onClick={() => setOpen(true)} disabled={disabled}>
                Skip Round
            </Button>
            <Dialog open={open} onClose={() => setOpen(false)} aria-labelledby="skip-round-title">
                <DialogTitle id="skip-round-title">Skip this round?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        This will delete the round and all its questions. This action cannot be undone.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpen(false)}>Cancel</Button>
                    <Button
                        color="error"
                        variant="contained"
                        onClick={async () => {
                            setOpen(false);
                            await onSkip?.();
                        }}
                    >
                        Skip Round
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default SkipRoundButton;
