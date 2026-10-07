import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
    Alert, Box, Button, Card, CardContent, Chip, CircularProgress,
    Divider, LinearProgress, Stack, Typography,
} from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import api from "../api/axios";
import FeedbackPanel from "../components/FeedbackPanel";
import { buildInterviewFeedbackSummary } from "../utils/interviewFeedbackSummary";
import { describeError } from "../utils/errorFormatter";

const ScoreBar = ({ score }) => {
    const normalized = Math.max(0, Math.min(10, Number(score) || 0));
    return (
        <Stack spacing={0.5} sx={{ minWidth: 210 }}>
            <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">Overall score</Typography>
                <Typography fontWeight={800}>{normalized}/10</Typography>
            </Stack>
            <LinearProgress variant="determinate" value={normalized * 10} sx={{ height: 8, borderRadius: 999 }} />
        </Stack>
    );
};

const InterviewFeedbackPage = () => {
    const { interviewId } = useParams();
    const [interview, setInterview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const refreshCountRef = useRef(0);

    const loadInterview = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setLoading(true);
        try {
            const { data } = await api.get(`/interviews/${interviewId}`);
            setInterview(data);
            setError("");
        } catch (requestError) {
            setError(describeError(requestError, "Could not load interview feedback."));
        } finally {
            if (!silent) setLoading(false);
        }
    }, [interviewId]);

    useEffect(() => { void loadInterview(); }, [loadInterview]);

    const summary = useMemo(() => buildInterviewFeedbackSummary(interview), [interview]);

    useEffect(() => {
        if (!summary.feedbackPending || refreshCountRef.current >= 24) return undefined;
        const timer = window.setTimeout(async () => {
            refreshCountRef.current += 1;
            await loadInterview({ silent: true });
        }, 2500);
        return () => window.clearTimeout(timer);
    }, [loadInterview, summary.feedbackPending, interview]);

    if (loading && !interview) {
        return <Box sx={{ minHeight: "60vh", display: "grid", placeItems: "center" }}><CircularProgress /></Box>;
    }

    return (
        <Box sx={{ width: "100%", maxWidth: 1120, mx: "auto", px: { xs: 2, sm: 3 }, py: { xs: 3, md: 5 } }}>
            <Stack spacing={3}>
                <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={2} alignItems={{ sm: "center" }}>
                    <Box>
                        <Typography variant="overline" color="primary.main">Practice interview</Typography>
                        <Typography component="h1" variant="h4" fontWeight={850}>Overall interview feedback</Typography>
                        <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                            One report across every completed round, built from the detailed feedback generated for your answers.
                        </Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                        <Button component={Link} to={`/practice/interviews/${interviewId}`} startIcon={<ArrowBackRoundedIcon />}>Back to interview</Button>
                        <Button variant="outlined" startIcon={<RefreshRoundedIcon />} onClick={() => { refreshCountRef.current = 0; void loadInterview(); }}>Refresh</Button>
                    </Stack>
                </Stack>

                {error && <Alert severity="error">{error}</Alert>}
                {summary.feedbackPending && (
                    <Alert severity="info">
                        Final detailed feedback is still being attached. This page is refreshing automatically; completed feedback will appear here without a manual reload.
                    </Alert>
                )}

                <Card variant="outlined">
                    <CardContent>
                        <Stack spacing={2.5}>
                            <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={3} alignItems={{ md: "center" }}>
                                <Box>
                                    <Typography variant="h6" fontWeight={800}>Interview summary</Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {summary.scoredQuestionCount} question{summary.scoredQuestionCount === 1 ? "" : "s"} scored across {summary.rounds.length} completed round{summary.rounds.length === 1 ? "" : "s"}.
                                    </Typography>
                                </Box>
                                {summary.overallScore !== null ? <ScoreBar score={summary.overallScore} /> : <Chip label="Feedback pending" />}
                            </Stack>

                            {(summary.strongestRound || summary.focusRound) && <Divider />}
                            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                                {summary.strongestRound && (
                                    <Box sx={{ flex: 1 }}>
                                        <Typography variant="overline" color="success.main">Strongest round</Typography>
                                        <Typography variant="h6">{summary.strongestRound.name}</Typography>
                                        <Typography variant="body2" color="text.secondary">Average {summary.strongestRound.score}/10 from {summary.strongestRound.scoredQuestionCount} scored answer{summary.strongestRound.scoredQuestionCount === 1 ? "" : "s"}.</Typography>
                                    </Box>
                                )}
                                {summary.focusRound && (
                                    <Box sx={{ flex: 1 }}>
                                        <Typography variant="overline" color="warning.main">Focus next</Typography>
                                        <Typography variant="h6">{summary.focusRound.name}</Typography>
                                        <Typography variant="body2" color="text.secondary">Average {summary.focusRound.score}/10. Use the detailed suggestions below as your next-practice checklist.</Typography>
                                    </Box>
                                )}
                            </Stack>

                            {summary.topSuggestions.length > 0 && (
                                <Box>
                                    <Typography variant="subtitle1" fontWeight={800} gutterBottom>Top improvements across the interview</Typography>
                                    <Stack component="ol" spacing={0.75} sx={{ my: 0, pl: 2.5 }}>
                                        {summary.topSuggestions.map((suggestion) => <Typography component="li" variant="body2" key={suggestion}>{suggestion}</Typography>)}
                                    </Stack>
                                </Box>
                            )}
                        </Stack>
                    </CardContent>
                </Card>

                {summary.rounds.length === 0 && !summary.feedbackPending ? (
                    <Alert severity="info">Complete at least one round to see interview-level feedback.</Alert>
                ) : (
                    <Stack spacing={4}>
                        {(interview?.rounds || []).map((entry) => entry?.round).filter((round) => round?.status === "completed").map((round) => (
                            <Box key={round._id}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} sx={{ mb: 1 }}>
                                    <Typography variant="h5" fontWeight={800}>{round.name || "Round"}</Typography>
                                    <Chip size="small" label="Completed" color="success" variant="outlined" />
                                </Stack>
                                <FeedbackPanel round={round} showOverallLink={false} />
                            </Box>
                        ))}
                    </Stack>
                )}
            </Stack>
        </Box>
    );
};

export default InterviewFeedbackPage;
