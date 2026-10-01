import { useRef, useState } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from "@mui/material";

export default function useBillingPhone() {
    const [open, setOpen] = useState(false);
    const [phone, setPhone] = useState("");
    const pending = useRef(null);
    const finish = (value) => { setOpen(false); pending.current?.(value); pending.current = null; };
    const valid = /^[+\d][\d\s-]{7,19}$/.test(phone);
    return {
        requestBillingPhone: () => new Promise(resolve => { pending.current = resolve; setOpen(true); }),
        billingPhoneDialog: <Dialog open={open} onClose={() => finish(null)} maxWidth="xs" fullWidth>
            <DialogTitle>Billing contact</DialogTitle>
            <DialogContent><Typography color="text.secondary" variant="body2" mb={2}>PayU needs a phone number for payment verification and recurring-payment notices. You’ll review the amount and renewal terms before continuing.</Typography><TextField autoFocus fullWidth type="tel" label="Billing phone number" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" /></DialogContent>
            <DialogActions><Button onClick={() => finish(null)}>Cancel</Button><Button variant="contained" disabled={!valid} onClick={() => finish(phone)}>Review payment</Button></DialogActions>
        </Dialog>,
    };
}
