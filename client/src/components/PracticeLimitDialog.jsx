import { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from "@mui/material";

export const PRACTICE_LIMIT_EVENT = "evalcue:practice-limit";

export default function PracticeLimitDialog() {
    const [limit, setLimit] = useState(null);

    useEffect(() => {
        const onLimit = (event) => setLimit(event?.detail || {});
        window.addEventListener(PRACTICE_LIMIT_EVENT, onLimit);
        return () => window.removeEventListener(PRACTICE_LIMIT_EVENT, onLimit);
    }, []);

    if (!limit) return null;

    const metricLabel = limit.metric === "resumeReviews" ? "resume reviews" : "practice interviews";

    return (
        <Dialog open onClose={() => setLimit(null)} maxWidth="sm" fullWidth aria-labelledby="practice-limit-title">
            <DialogTitle id="practice-limit-title">You’ve reached this month’s free allowance</DialogTitle>
            <DialogContent>
                <Stack spacing={1.5}>
                    <Typography>{limit.message || `You’ve used all included ${metricLabel} for this month.`}</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Your work is still saved. You can wait for the monthly reset or compare Practice plans to continue now.
                    </Typography>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setLimit(null)}>Not now</Button>
                <Button component={RouterLink} to="/practice/pricing" variant="contained" onClick={() => setLimit(null)}>
                    View Practice plans
                </Button>
            </DialogActions>
        </Dialog>
    );
}
