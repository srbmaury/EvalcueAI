import { useEffect, useMemo, useState } from "react";
import {
    Alert,
    Box,
    Chip,
    Container,
    LinearProgress,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
} from "@mui/material";
import api from "../api/axios";
import AiQualitySection from "../components/AiQualitySection";
import { calibrationHealth } from "../utils/calibrationHealth";
import { describeError } from "../utils/errorFormatter";

const Metric = ({ label, value, helper }) => (
    <Paper variant="outlined" sx={{ p: 2.25, minHeight: 118 }}>
        <Typography variant="overline" color="text.secondary">{label}</Typography>
        <Typography variant="h4" fontWeight={850} mt={0.25}>{value}</Typography>
        {helper && <Typography variant="body2" color="text.secondary" mt={0.5}>{helper}</Typography>}
    </Paper>
);

const pct = (value) => `${Number(value || 0).toFixed(1)}%`;
const score = (value) => value == null ? "—" : Number(value).toFixed(1);
const readinessCopy = {
    collecting: ["warning", "Collecting calibration evidence", "Fewer than 20 human-reviewed score pairs are available. Treat agreement numbers as exploratory, not as validation."],
    directional: ["info", "Directional calibration sample", "There are enough human reviews to spot obvious bias and disagreement patterns, but not enough to treat the model as fully calibrated."],
    larger_sample: ["success", "Larger calibration sample", "The sample is large enough for more stable monitoring. Continue watching role-, rubric-, and prompt-version slices for regressions."],
};

const SegmentTable = ({ title, rows, labelKey }) => (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Typography variant="h6" fontWeight={850} mb={1.5}>{title}</Typography>
        <TableContainer tabIndex={0}>
            <Table size="small">
                <TableHead><TableRow><TableCell>{labelKey === "jobRole" ? "Job role" : "Round"}</TableCell><TableCell align="right">Rounds</TableCell><TableCell align="right">Avg questions</TableCell><TableCell align="right">Coverage</TableCell><TableCell align="right">Early stop</TableCell><TableCell align="right">Fallback</TableCell></TableRow></TableHead>
                <TableBody>
                    {(rows || []).map((row) => <TableRow key={row[labelKey]} hover><TableCell>{row[labelKey]}</TableCell><TableCell align="right">{row.rounds}</TableCell><TableCell align="right">{score(row.averageCompletedQuestions || row.averageQuestions)}</TableCell><TableCell align="right">{pct(row.averageCoverage)}</TableCell><TableCell align="right">{pct(row.earlyStopRate)}</TableCell><TableCell align="right">{pct(row.fallbackQuestionRate)}</TableCell></TableRow>)}
                    {!rows?.length && <TableRow><TableCell colSpan={6}><Typography color="text.secondary">No adaptive data yet.</Typography></TableCell></TableRow>}
                </TableBody>
            </Table>
        </TableContainer>
    </Paper>
);

export default function AdminCalibrationPage() {
    const [data, setData] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        api.get("/admin/calibration")
            .then(({ data: response }) => { if (!cancelled) setData(response); })
            .catch((err) => { if (!cancelled) setError(describeError(err, "Could not load calibration analytics.")); });
        return () => { cancelled = true; };
    }, []);

    const transitions = useMemo(() => Object.entries(data?.decisions?.difficultyTransitions || {}).sort((a, b) => b[1] - a[1]), [data]);
    const decisions = useMemo(() => Object.entries(data?.reviewerAgreement?.byDecision || {}), [data]);

    if (error) return <Container maxWidth="lg" sx={{ py: 4 }}><Alert severity="error">{error}</Alert></Container>;
    if (!data) return <Container maxWidth="lg" sx={{ py: 4 }}><LinearProgress /></Container>;

    const adaptive = data.adaptive || {};
    const agreement = data.reviewerAgreement || {};
    const readiness = readinessCopy[data.calibrationReadiness] || readinessCopy.collecting;
    const health = calibrationHealth(data);

    return (
        <Container maxWidth="xl" sx={{ py: 4 }}>
            <Stack spacing={3}>
                <Box>
                    <Typography component="h1" variant="h4" fontWeight={900}>AI interview calibration</Typography>
                    <Typography color="text.secondary" mt={0.75} maxWidth={900}>
                        Internal quality signals for adaptive Practice interviews and human-reviewed Hiring attempts. This view intentionally excludes candidate answers, names, emails, and resume text.
                    </Typography>
                </Box>

                <Alert severity={readiness[0]}><strong>{readiness[1]}.</strong> {readiness[2]}</Alert>
                {health.status === "stable" && <Alert severity="success"><strong>Calibration guardrails are within the current thresholds.</strong> Continue monitoring as the reviewer and adaptive-round samples grow.</Alert>}
                {health.signals.map((signal) => <Alert key={signal.key} severity={signal.severity}><strong>{signal.title}.</strong> {signal.detail}</Alert>)}

                <AiQualitySection />

                <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(2,1fr)", xl: "repeat(4,1fr)" } }}>
                    <Metric label="Adaptive rounds" value={adaptive.rounds || 0} helper={`${adaptive.completed || 0} completed`} />
                    <Metric label="Avg. questions" value={score(adaptive.averageCompletedQuestions || adaptive.averageQuestions)} helper={`Early stop ${pct(adaptive.earlyStopRate)}`} />
                    <Metric label="Avg. coverage" value={pct(adaptive.averageCoverage)} helper={`Fallback questions ${pct(adaptive.fallbackQuestionRate)}`} />
                    <Metric label="Resume probing" value={pct(adaptive.resumeProbeRate)} helper={`${score(adaptive.averageFollowUpsPerQuestion)} follow-ups / question`} />
                </Box>

                <Box>
                    <Typography variant="h5" fontWeight={850} mb={1.5}>Human reviewer agreement</Typography>
                    <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(2,1fr)", xl: "repeat(5,1fr)" } }}>
                        <Metric label="Reviewed pairs" value={agreement.reviewedPairs || 0} helper="AI score + human reviewer score" />
                        <Metric label="Mean absolute error" value={score(agreement.meanAbsoluteError)} helper={`Median ${score(agreement.medianAbsoluteError)}`} />
                        <Metric label="P90 error" value={score(agreement.p90AbsoluteError)} helper={`${pct(agreement.overTwoPoints)} differ by >2`} />
                        <Metric label="Within 1 point" value={pct(agreement.withinOnePoint)} helper={`Within 0.5: ${pct(agreement.withinHalfPoint)}`} />
                        <Metric label="Correlation" value={agreement.correlation == null ? "—" : agreement.correlation.toFixed(2)} helper={`Mean bias: ${score(agreement.meanBias)}`} />
                    </Box>
                </Box>

                {(data.disagreements || []).length > 0 && (
                    <Box>
                        <Typography variant="h5" fontWeight={850} mb={0.5}>Largest AI ↔ human disagreements</Typography>
                        <Typography variant="body2" color="text.secondary" mb={1.5}>Prioritize these cases for rubric/prompt review. Candidate identity and answer text are intentionally omitted.</Typography>
                        <TableContainer component={Paper} variant="outlined" tabIndex={0}>
                            <Table size="small">
                                <TableHead><TableRow><TableCell>Role</TableCell><TableCell>Assessment</TableCell><TableCell align="right">AI</TableCell><TableCell align="right">Human</TableCell><TableCell align="right">Δ</TableCell><TableCell>Decision</TableCell><TableCell>Reviewed</TableCell></TableRow></TableHead>
                                <TableBody>{data.disagreements.map((item) => <TableRow key={item.attemptId} hover><TableCell>{item.jobRole || "—"}</TableCell><TableCell>{item.assessmentTitle || "—"}</TableCell><TableCell align="right">{score(item.aiScore)}</TableCell><TableCell align="right">{score(item.humanScore)}</TableCell><TableCell align="right"><Chip size="small" color={item.absoluteDelta > 2 ? "warning" : "default"} label={`${item.delta > 0 ? "+" : ""}${score(item.delta)}`} /></TableCell><TableCell>{item.reviewerDecision}</TableCell><TableCell sx={{ whiteSpace: "nowrap" }}>{item.reviewedAt ? new Date(item.reviewedAt).toLocaleDateString() : "—"}</TableCell></TableRow>)}</TableBody>
                            </Table>
                        </TableContainer>
                    </Box>
                )}

                <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" } }}>
                    <Paper variant="outlined" sx={{ p: 2.5 }}>
                        <Typography variant="h6" fontWeight={850} mb={1.5}>Agreement by job role</Typography>
                        <TableContainer tabIndex={0}><Table size="small"><TableHead><TableRow><TableCell>Role</TableCell><TableCell align="right">Pairs</TableCell><TableCell align="right">MAE</TableCell><TableCell align="right">Within 1</TableCell><TableCell align="right">Bias</TableCell></TableRow></TableHead><TableBody>{(agreement.byJobRole || []).map((row) => <TableRow key={row.jobRole} hover><TableCell>{row.jobRole}</TableCell><TableCell align="right">{row.reviewedPairs}</TableCell><TableCell align="right">{score(row.meanAbsoluteError)}</TableCell><TableCell align="right">{pct(row.withinOnePoint)}</TableCell><TableCell align="right">{score(row.meanBias)}</TableCell></TableRow>)}{!agreement.byJobRole?.length && <TableRow><TableCell colSpan={5}><Typography color="text.secondary">No role-level reviewer pairs yet.</Typography></TableCell></TableRow>}</TableBody></Table></TableContainer>
                    </Paper>

                    <Paper variant="outlined" sx={{ p: 2.5 }}>
                        <Typography variant="h6" fontWeight={850} mb={1.5}>Rubric criterion agreement</Typography>
                        <Typography variant="body2" color="text.secondary" mb={1.5}>{agreement.criteria?.matchedRatings || 0} human rubric ratings matched to AI-scored competencies by normalized criterion name.</Typography>
                        <TableContainer tabIndex={0}><Table size="small"><TableHead><TableRow><TableCell>Criterion</TableCell><TableCell align="right">Pairs</TableCell><TableCell align="right">AI</TableCell><TableCell align="right">Human</TableCell><TableCell align="right">MAE</TableCell></TableRow></TableHead><TableBody>{(agreement.criteria?.byCriterion || []).map((row) => <TableRow key={row.criterion} hover><TableCell>{row.criterion}</TableCell><TableCell align="right">{row.count}</TableCell><TableCell align="right">{score(row.averageAiScore)}</TableCell><TableCell align="right">{score(row.averageHumanScore)}</TableCell><TableCell align="right">{score(row.meanAbsoluteError)}</TableCell></TableRow>)}{!agreement.criteria?.byCriterion?.length && <TableRow><TableCell colSpan={5}><Typography color="text.secondary">No rubric criteria can be matched yet.</Typography></TableCell></TableRow>}</TableBody></Table></TableContainer>
                    </Paper>
                </Box>

                <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" } }}>
                    <SegmentTable title="Adaptive behavior by job role" rows={data.adaptiveByRole} labelKey="jobRole" />
                    <SegmentTable title="Adaptive behavior by round" rows={data.adaptiveByRound} labelKey="roundName" />
                </Box>

                <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" } }}>
                    <Paper variant="outlined" sx={{ p: 2.5 }}>
                        <Typography variant="h6" fontWeight={850}>Difficulty transitions</Typography>
                        <Typography variant="body2" color="text.secondary" mb={1.5}>Only actual difficulty changes are counted.</Typography>
                        <Stack direction="row" gap={1} flexWrap="wrap">{transitions.length ? transitions.map(([transition, count]) => <Chip key={transition} label={`${transition} · ${count}`} />) : <Typography variant="body2" color="text.secondary">No transitions recorded yet.</Typography>}</Stack>
                    </Paper>

                    <Paper variant="outlined" sx={{ p: 2.5 }}>
                        <Typography variant="h6" fontWeight={850}>Prompt-version cohorts</Typography>
                        <Typography variant="body2" color="text.secondary" mb={1.5}>Use these cohorts to detect behavior changes when an adaptive prompt bundle is updated.</Typography>
                        <Stack spacing={1}>{(data.promptVersions || []).map((item) => <Stack key={item.promptVersion} direction={{ xs: "column", sm: "row" }} gap={1} alignItems={{ sm: "center" }}><Chip label={item.promptVersion} /><Typography variant="body2">{item.events} events · {item.completed} completed · {item.fallbackEvents} fallback · {item.difficultyChanges} difficulty changes</Typography></Stack>)}{!data.promptVersions?.length && <Typography variant="body2" color="text.secondary">No prompt-version data yet.</Typography>}</Stack>
                    </Paper>
                </Box>

                {decisions.length > 0 && <Paper variant="outlined" sx={{ p: 2.5 }}><Typography variant="h6" fontWeight={850} mb={1.5}>Agreement by reviewer decision</Typography><Stack direction="row" gap={1} flexWrap="wrap">{decisions.map(([decision, item]) => <Chip key={decision} label={`${decision}: ${item.count} · AI ${score(item.averageAiScore)} / human ${score(item.averageHumanScore)}`} />)}</Stack></Paper>}

                <Box>
                    <Typography variant="h5" fontWeight={850} mb={1.5}>Recent adaptive decision trace</Typography>
                    <TableContainer component={Paper} variant="outlined" tabIndex={0}>
                        <Table size="small">
                            <TableHead><TableRow><TableCell>Time</TableCell><TableCell>Role / round</TableCell><TableCell>Event</TableCell><TableCell>Target</TableCell><TableCell>Difficulty</TableCell><TableCell>Coverage</TableCell><TableCell>Questions</TableCell><TableCell>Source</TableCell><TableCell>Version</TableCell><TableCell>Reason</TableCell></TableRow></TableHead>
                            <TableBody>
                                {(data.recentTraces || []).map((trace, index) => <TableRow key={`${trace.createdAt}-${index}`} hover><TableCell sx={{ whiteSpace: "nowrap" }}>{trace.createdAt ? new Date(trace.createdAt).toLocaleString() : "—"}</TableCell><TableCell sx={{ minWidth: 180 }}><Typography variant="body2" fontWeight={700}>{trace.jobRole || "—"}</Typography><Typography variant="caption" color="text.secondary">{trace.roundName || "—"}</Typography></TableCell><TableCell>{trace.eventType}</TableCell><TableCell>{trace.targetCompetency || "—"}</TableCell><TableCell>{trace.difficultyFrom || "—"} → {trace.difficultyTo || "—"}</TableCell><TableCell>{pct(trace.coverageBefore)} → {pct(trace.coverageAfter)}</TableCell><TableCell>{trace.questionsAsked}/{trace.questionCount}</TableCell><TableCell><Stack direction="row" gap={0.5} flexWrap="wrap">{trace.sourceType && <Chip size="small" label={trace.sourceType} />}{trace.fallbackUsed && <Chip size="small" color="warning" label="fallback" />}{trace.usedResumeClaim && <Chip size="small" color="info" label="resume" />}</Stack></TableCell><TableCell sx={{ whiteSpace: "nowrap" }}>{trace.promptVersion || trace.engineVersion || "—"}</TableCell><TableCell sx={{ minWidth: 260 }}>{trace.reason || "—"}</TableCell></TableRow>)}
                                {!data.recentTraces?.length && <TableRow><TableCell colSpan={10}><Typography color="text.secondary">No adaptive trace events recorded yet.</Typography></TableCell></TableRow>}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Box>

                <Alert severity="info">Provider/model request success, latency, token usage and adaptive prompt-purpose metrics remain in Prometheus. MongoDB keeps only bounded technical decision traces and score calibration data.</Alert>
            </Stack>
        </Container>
    );
}
