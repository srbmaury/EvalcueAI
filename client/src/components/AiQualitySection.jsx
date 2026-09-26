import { useEffect, useState } from "react";
import { Alert, Box, Chip, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import api from "../api/axios";
import { describeError } from "../utils/errorFormatter";

// Each rate is a percentage over its own denominator; `warnAbove` marks where it deserves a prompt review.
const RATES = [
    { key: "followUpGuardInterventions", label: "Follow-up guard interventions", helper: "Drafts that invented facts or repeated a probe", volume: "followUpDecisions", warnAbove: 15 },
    { key: "followUpSuppressed", label: "Follow-ups suppressed", helper: "Still ungrounded or repetitive after a retry", volume: "followUpDecisions", warnAbove: 10 },
    { key: "followUpProviderUnavailable", label: "Follow-ups skipped (provider)", helper: "AI provider unavailable", volume: "followUpDecisions", warnAbove: 5 },
    { key: "nextQuestionFallback", label: "Next-question fallbacks", helper: "Served by the fallback generator or local bank", volume: "nextQuestions", warnAbove: 10 },
    { key: "adaptiveUnscored", label: "Unscored answers", helper: "Evaluation failed after a retry", volume: "adaptiveEvaluations", warnAbove: 2 },
    { key: "feedbackFailed", label: "Feedback failures", helper: "Final evaluation retried by the job queue", volume: "feedbackEvaluations", warnAbove: 2 },
];

const LABELS = { followup: "Follow-up", next_question: "Next question", adaptive_evaluation: "Answer evaluation", feedback_evaluation: "Final feedback", question_generation: "Question generation" };

export default function AiQualitySection({ days = 30 }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        api.get("/admin/ai-quality", { params: { days } })
            .then(({ data: response }) => { if (!cancelled) setData(response); })
            .catch((err) => { if (!cancelled) setError(describeError(err, "Could not load AI quality signals.")); });
        return () => { cancelled = true; };
    }, [days]);

    if (error) return <Alert severity="warning">{error}</Alert>;
    if (!data) return null;

    const flagged = RATES.filter((item) => data.rates[item.key] != null && data.rates[item.key] > item.warnAbove);

    return (
        <Box>
            <Typography variant="h5" fontWeight={850}>AI quality, last {data.days} days</Typography>
            <Typography variant="body2" color="text.secondary" mb={1.5}>
                How often guards had to correct the interviewer, and how often evaluation failed instead of producing a score. Counted since {data.since}.
            </Typography>
            {flagged.length > 0 && <Alert severity="warning" sx={{ mb: 1.5 }}><strong>Above threshold:</strong> {flagged.map((item) => item.label).join(", ")}. Review recent prompts and provider health.</Alert>}
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(2,1fr)", xl: "repeat(3,1fr)" } }}>
                {RATES.map((item) => {
                    const value = data.rates[item.key];
                    const warn = value != null && value > item.warnAbove;
                    return (
                        <Paper key={item.key} variant="outlined" sx={{ p: 2.25, borderColor: warn ? "warning.main" : undefined }}>
                            <Typography variant="overline" color="text.secondary">{item.label}</Typography>
                            <Typography variant="h4" fontWeight={850} color={warn ? "warning.main" : "text.primary"}>{value == null ? "—" : `${value.toFixed(1)}%`}</Typography>
                            <Typography variant="body2" color="text.secondary">{item.helper} · of {data.volume[item.volume] || 0} · alert above {item.warnAbove}%</Typography>
                        </Paper>
                    );
                })}
            </Box>
            {data.totals.length > 0 && (
                <TableContainer component={Paper} variant="outlined" tabIndex={0} sx={{ mt: 2 }} aria-label="AI quality event totals">
                    <Table size="small">
                        <TableHead><TableRow><TableCell>Stage</TableCell><TableCell>Signal</TableCell><TableCell>Outcome</TableCell><TableCell align="right">Count</TableCell></TableRow></TableHead>
                        <TableBody>
                            {data.totals.map((row) => (
                                <TableRow key={`${row.stage}-${row.signal}-${row.outcome}`} hover>
                                    <TableCell>{LABELS[row.stage] || row.stage}</TableCell>
                                    <TableCell>{row.signal.replaceAll("_", " ")}</TableCell>
                                    <TableCell><Chip size="small" label={row.outcome.replaceAll("_", " ")} color={["suppressed", "unscored", "failed", "provider_unavailable", "deterministic"].includes(row.outcome) ? "warning" : "default"} variant="outlined" /></TableCell>
                                    <TableCell align="right">{row.count}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
            {!data.totals.length && <Stack mt={1}><Typography color="text.secondary">No AI quality events recorded yet.</Typography></Stack>}
        </Box>
    );
}
