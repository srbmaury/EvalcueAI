import { Alert, Box, Button, Card, CardContent, Chip, Divider, LinearProgress, Stack, TextField, Typography } from "@mui/material";
import { memo, useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import { trackEvent } from "../utils/analytics";
import { describeError } from "../utils/errorFormatter";
import { limitedEvidence } from "../utils/evidenceStrength";

const getScore = (item) => {
    const rawScore = item?.feedback?.score;
    if (rawScore === null || rawScore === undefined || rawScore === "") return null;
    const score = Number(rawScore);
    return Number.isFinite(score) ? score : null;
};

const ScoreBar = ({ score, label = "Score" }) => {
    const normalized = Math.max(0, Math.min(10, Number(score) || 0));
    return (
        <Stack spacing={0.5} sx={{ minWidth: 160 }}>
            <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption" color="text.secondary">{label}</Typography>
                <Typography variant="caption" color="text.secondary">{normalized}/10</Typography>
            </Stack>
            <LinearProgress variant="determinate" value={(normalized / 10) * 100} aria-label={`${label}: ${normalized} out of 10`} />
        </Stack>
    );
};

const FeedbackItem = memo(({ index, item }) => {
    const qText = item?.question?.text || "";
    const answer = item?.answerGiven || "";
    const feedback = item?.feedback || null;
    const suggestions = Array.isArray(feedback?.suggestions) ? feedback.suggestions : [];
    const followUps = Array.isArray(item?.followUps) ? item.followUps.filter((entry) => entry?.question) : [];
    const dimensions = Array.isArray(feedback?.dimensions) ? feedback.dimensions : [];
    const evidence = Array.isArray(feedback?.evidence) ? feedback.evidence : [];

    return (
        <Card variant="outlined">
            <CardContent>
                <Stack spacing={1.2}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Typography variant="subtitle2">Question {index + 1}</Typography>
                        {item?.sourceType === "resume-claim" && <Chip size="small" label="Resume deep dive" variant="outlined" />}
                    </Stack>
                    <Typography>{qText}</Typography>

                    {answer && (
                        <Box>
                            <Typography variant="caption" color="text.secondary">Your answer</Typography>
                            <Box sx={{ mt: 0.5, p: 1, bgcolor: (theme) => theme.palette.action.hover, borderRadius: 1, whiteSpace: "pre-wrap", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}>
                                {answer}
                            </Box>
                        </Box>
                    )}

                    {followUps.map((followUp, followUpIndex) => (
                        <Box key={`${followUp.question}-${followUpIndex}`} sx={{ pl: 1.5, borderLeft: "2px solid", borderColor: "divider" }}>
                            <Typography variant="caption" color="text.secondary">Follow-up {followUpIndex + 1}</Typography>
                            <Typography variant="body2" fontWeight={700}>{followUp.question}</Typography>
                            {followUp.skipped ? (
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Skipped</Typography>
                            ) : followUp.answer ? (
                                <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}>{followUp.answer}</Typography>
                            ) : null}
                        </Box>
                    ))}

                    {feedback ? (
                        <Stack spacing={1.25}>
                            <Divider />
                            <Typography variant="subtitle2">Feedback</Typography>
                            <Typography color="text.primary">{feedback.comment || ""}</Typography>
                            <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "flex-end" }}>
                                <ScoreBar score={feedback.score} />
                                {Number.isFinite(Number(feedback?.confidence)) && (
                                    <Box>
                                        <Typography variant="caption" color="text.secondary">Evidence confidence</Typography>
                                        <Typography variant="body2" fontWeight={700}>{Math.round(Number(feedback.confidence) * 100)}%</Typography>
                                    </Box>
                                )}
                            </Stack>
                            {dimensions.length > 0 && (
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Evaluation dimensions</Typography>
                                    <Stack direction="row" flexWrap="wrap" gap={1} mt={0.5}>
                                        {dimensions.map((dimension) => (
                                            <Chip key={dimension.name} size="small" label={`${dimension.name}: ${Number(dimension.score).toFixed(1)}/10`} variant="outlined" />
                                        ))}
                                    </Stack>
                                </Box>
                            )}
                            {evidence.length > 0 && (
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Evidence used</Typography>
                                    <Stack component="ul" spacing={0.25} sx={{ mt: 0.5, mb: 0, pl: 2.5 }}>
                                        {evidence.slice(0, 5).map((entry) => <Typography key={entry} component="li" variant="body2">{entry}</Typography>)}
                                    </Stack>
                                </Box>
                            )}
                            {suggestions.length > 0 && (
                                <Stack spacing={0.5}>
                                    <Typography variant="caption" color="text.secondary">Suggestions</Typography>
                                    <Stack direction="row" flexWrap="wrap" gap={1}>
                                        {suggestions.map((suggestion, suggestionIndex) => <Chip key={suggestionIndex} label={suggestion} size="small" />)}
                                    </Stack>
                                </Stack>
                            )}
                        </Stack>
                    ) : (
                        <Typography variant="body2" color="text.secondary">Feedback not available yet.</Typography>
                    )}
                </Stack>
            </CardContent>
        </Card>
    );
});

const FeedbackPanel = ({ round }) => {
    const [retryItem, setRetryItem] = useState(null);
    const [retryAnswer, setRetryAnswer] = useState("");
    const [retryResult, setRetryResult] = useState(null);
    const [retryChecking, setRetryChecking] = useState(false);
    const [retryError, setRetryError] = useState("");
    const resetRetry = (item = null) => { setRetryItem(item); setRetryAnswer(""); setRetryResult(null); setRetryError(""); };
    // Scores the retry as a separate feedback record; the submitted answer and round score are unchanged.
    const checkRetry = async () => {
        const questionId = retryItem?.item?.question?._id;
        if (!questionId || !retryAnswer.trim()) return;
        setRetryChecking(true);
        setRetryError("");
        try {
            const { data } = await api.post(`/feedback/${questionId}`, { answer: retryAnswer.trim() });
            setRetryResult(data);
            trackEvent("retry_feedback_received");
        } catch (error) {
            setRetryError(describeError(error, "Could not score this retry. Try again in a moment."));
        } finally {
            setRetryChecking(false);
        }
    };
    const items = useMemo(() => (Array.isArray(round?.questions) ? round.questions : []), [round?.questions]);
    const scoredItems = useMemo(() => items
        .map((item, index) => ({ item, index, score: getScore(item) }))
        .filter(({ score }) => score !== null)
        .sort((a, b) => b.score - a.score), [items]);
    const strongest = scoredItems[0] || null;
    const weakest = scoredItems.length > 1 ? scoredItems[scoredItems.length - 1] : scoredItems[0] || null;
    const topSuggestions = useMemo(() => {
        const seen = new Set();
        const result = [];
        [...scoredItems].reverse().forEach(({ item }) => {
            (Array.isArray(item?.feedback?.suggestions) ? item.feedback.suggestions : []).forEach((suggestion) => {
                const value = String(suggestion || "").trim();
                const key = value.toLocaleLowerCase();
                if (value && !seen.has(key) && result.length < 3) {
                    seen.add(key);
                    result.push(value);
                }
            });
        });
        return result;
    }, [scoredItems]);
    const avgScore = useMemo(() => {
        const scores = items.map(getScore).filter((score) => score !== null);
        return scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
    }, [items]);
    const scoreCount = useMemo(() => items.reduce((acc, item) => acc + (getScore(item) !== null ? 1 : 0), 0), [items]);
    const competencies = useMemo(() => (Array.isArray(round?.adaptiveState?.competencies) ? round.adaptiveState.competencies : [])
        .filter((item) => Number(item?.evidenceCount) > 0 || Number(item?.confidence) > 0)
        .sort((a, b) => Number(b?.confidence || 0) - Number(a?.confidence || 0)), [round?.adaptiveState?.competencies]);

    useEffect(() => {
        setRetryItem(null);
        setRetryAnswer("");
        if (round?._id) trackEvent("feedback_viewed");
    }, [round?._id]);

    return (
        <Stack spacing={2} mt={2}>
            <Card variant="outlined">
                <CardContent>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "flex-start", sm: "center" }} justifyContent="space-between">
                        <Stack spacing={0.5}>
                            <Typography variant="subtitle1">Round feedback</Typography>
                            <Typography variant="body2" color="text.secondary">Based on {scoreCount} answered question{scoreCount === 1 ? "" : "s"} with feedback</Typography>
                            {limitedEvidence(items.map((item) => item?.answerGiven)) && <Chip size="small" color="warning" variant="outlined" label="Limited evidence: short answers make this score less reliable" sx={{ mt: .75 }} />}
                            {round?.adaptiveState?.completedReason && (
                                <Typography variant="caption" color="text.secondary">Adaptive round: {round.adaptiveState.completedReason}</Typography>
                            )}
                        </Stack>
                        {avgScore !== null ? <ScoreBar score={avgScore} /> : <Typography variant="body2" color="text.secondary">Feedback pending</Typography>}
                    </Stack>

                    {competencies.length > 0 && (
                        <Stack spacing={1.25} sx={{ mt: 2 }}>
                            <Divider />
                            <Box>
                                <Typography variant="subtitle2">Competency evidence</Typography>
                                <Typography variant="body2" color="text.secondary">Scores are estimates from observed answers; confidence shows how much evidence the interview collected.</Typography>
                            </Box>
                            <Stack spacing={1}>
                                {competencies.map((competency) => (
                                    <Box key={competency.name}>
                                        <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                                            <Typography variant="body2" fontWeight={700}>{competency.name}</Typography>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                {Number.isFinite(Number(competency.scoreEstimate)) && <Chip size="small" label={`${Number(competency.scoreEstimate).toFixed(1)}/10`} />}
                                                <Typography variant="caption" color="text.secondary">{Math.round(Number(competency.confidence || 0) * 100)}% confidence</Typography>
                                            </Stack>
                                        </Stack>
                                        <LinearProgress sx={{ mt: 0.5 }} variant="determinate" value={Math.max(0, Math.min(100, Number(competency.confidence || 0) * 100))} />
                                    </Box>
                                ))}
                            </Stack>
                        </Stack>
                    )}

                    {strongest && (
                        <Stack spacing={2} sx={{ mt: 2 }}>
                            <Divider />
                            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                                <Box sx={{ flex: 1 }}>
                                    <Typography variant="overline" color="success.main">{weakest === strongest ? "Answer score" : "Strongest answer"} · {strongest.score}/10</Typography>
                                    <Typography variant="body2">{strongest.item?.question?.text || `Question ${strongest.index + 1}`}</Typography>
                                </Box>
                                {weakest && weakest !== strongest && <Box sx={{ flex: 1 }}>
                                    <Typography variant="overline" color="warning.main">Focus next · {weakest.score}/10</Typography>
                                    <Typography variant="body2">{weakest.item?.question?.text || `Question ${weakest.index + 1}`}</Typography>
                                </Box>}
                            </Stack>
                            {topSuggestions.length > 0 && (
                                <Box>
                                    <Typography variant="subtitle2" gutterBottom>Top improvements</Typography>
                                    <Stack component="ol" spacing={0.5} sx={{ my: 0, pl: 2.5 }}>
                                        {topSuggestions.map((suggestion) => <Typography component="li" variant="body2" key={suggestion}>{suggestion}</Typography>)}
                                    </Stack>
                                </Box>
                            )}
                            <Box>
                                <Typography variant="subtitle2">Improved-answer guidance</Typography>
                                <Typography variant="body2" color="text.secondary">Re-answer the focus question using the improvements above as a checklist. Keep it direct, support claims with concrete evidence, explain trade-offs, and end with the result or takeaway.</Typography>
                            </Box>
                            <Box>
                                <Button variant="contained" onClick={() => { trackEvent("retry_started"); resetRetry(weakest); }}>Retry weak question</Button>
                            </Box>
                        </Stack>
                    )}
                </CardContent>
            </Card>

            {retryItem && (
                <Card variant="outlined" sx={{ borderColor: "primary.main" }}>
                    <CardContent>
                        <Stack spacing={1.5}>
                            <Box>
                                <Typography variant="overline" color="primary">Private retry</Typography>
                                <Typography variant="h6">{retryItem.item?.question?.text || `Question ${retryItem.index + 1}`}</Typography>
                            </Box>
                            {Array.isArray(retryItem.item?.feedback?.suggestions) && retryItem.item.feedback.suggestions.length > 0 && (
                                <Alert severity="info">Before answering: {retryItem.item.feedback.suggestions.join(" · ")}</Alert>
                            )}
                            <TextField label="Try a stronger answer" multiline minRows={5} value={retryAnswer} onChange={(event) => setRetryAnswer(event.target.value)} helperText="Scoring a retry does not replace your submitted answer or change your round score." fullWidth />
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                <Button variant="contained" onClick={checkRetry} disabled={!retryAnswer.trim() || retryChecking}>{retryChecking ? "Scoring…" : "Get feedback"}</Button>
                                <Button variant="outlined" onClick={() => { setRetryAnswer(""); setRetryResult(null); }} disabled={!retryAnswer || retryChecking}>Clear draft</Button>
                                <Button onClick={() => resetRetry(null)} disabled={retryChecking}>Close retry</Button>
                            </Stack>
                            {retryError && <Alert severity="error">{retryError}</Alert>}
                            {retryResult && (
                                <Alert severity={Number(retryResult.score) > Number(retryItem.score) ? "success" : "info"}>
                                    <Typography fontWeight={750}>Retry score: {retryResult.score ?? "—"}/10 <Typography component="span" variant="body2" color="text.secondary">(original {retryItem.score}/10)</Typography></Typography>
                                    <Typography variant="body2" sx={{ mt: .5 }}>{retryResult.comment}</Typography>
                                    {Array.isArray(retryResult.suggestions) && retryResult.suggestions.length > 0 && <Typography variant="body2" sx={{ mt: .5 }}>Next: {retryResult.suggestions.join(" · ")}</Typography>}
                                </Alert>
                            )}
                        </Stack>
                    </CardContent>
                </Card>
            )}

            <Stack spacing={2}>
                {items.map((item, index) => <FeedbackItem key={item?.question?._id || index} index={index} item={item} />)}
            </Stack>
        </Stack>
    );
};

export default memo(FeedbackPanel);
