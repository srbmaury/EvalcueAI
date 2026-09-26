import { useEffect, useState } from "react";
import {
    Alert, Box, Chip, Container, FormControl, InputLabel, LinearProgress, MenuItem, Paper, Select, Stack,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tab, Tabs, Typography,
} from "@mui/material";
import api from "../api/axios";
import { describeError } from "../utils/errorFormatter";
import { selfIdentificationLabel } from "../utils/selfIdentification";

const percent = (value) => (value === null || value === undefined ? "—" : `${Math.round(value * 100)}%`);
const ratio = (value) => (value === null || value === undefined ? "—" : value.toFixed(2));

const GROUPINGS = [
    { key: "sex", label: "Sex" },
    { key: "raceEthnicity", label: "Race / ethnicity" },
    { key: "intersectional", label: "Intersectional" },
];

function OutcomeTable({ title, description, outcome, grouping, minGroupSize }) {
    const section = outcome?.[grouping] || { groups: [], notProvided: 0 };
    return (
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
            <Typography component="h2" variant="h6" fontWeight={800}>{title}</Typography>
            <Typography variant="body2" color="text.secondary" mt={.5} mb={2}>{description}</Typography>
            {section.groups.length ? (
                <TableContainer tabIndex={0} aria-label={`${title} by group`}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Group</TableCell>
                                <TableCell align="right">Candidates</TableCell>
                                <TableCell align="right">Favourable</TableCell>
                                <TableCell align="right">Rate</TableCell>
                                <TableCell align="right">Impact ratio</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {section.groups.map((group) => (
                                <TableRow key={group.key}>
                                    <TableCell>{selfIdentificationLabel(group.key)}</TableCell>
                                    <TableCell align="right">{group.eligible}</TableCell>
                                    <TableCell align="right">{group.suppressed ? "—" : group.favourable}</TableCell>
                                    <TableCell align="right">{group.suppressed ? <Typography variant="caption" color="text.secondary">Fewer than {minGroupSize}</Typography> : percent(group.rate)}</TableCell>
                                    <TableCell align="right">
                                        {group.flagged ? <Chip size="small" color="warning" label={`${ratio(group.impactRatio)} · below 0.80`} /> : ratio(group.impactRatio)}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            ) : <Typography color="text.secondary">No candidates in this outcome have self-identified yet.</Typography>}
            <Typography variant="caption" color="text.secondary" display="block" mt={1.5}>
                {section.notProvided} of {outcome?.total || 0} candidates did not provide this information and are excluded from the rates above.
            </Typography>
        </Paper>
    );
}

export default function FairnessReportPage() {
    const [assessmentId, setAssessmentId] = useState("");
    const [grouping, setGrouping] = useState("sex");
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError("");
        api.get("/assessments/fairness", { params: assessmentId ? { assessmentId } : {} })
            .then(({ data }) => { if (!cancelled) setReport(data); })
            .catch((requestError) => { if (!cancelled) setError(describeError(requestError, "Could not load the fairness report.")); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [assessmentId]);

    const flaggedCount = report
        ? ["scoring", "selection"].flatMap((outcome) => GROUPINGS.flatMap(({ key }) => report[outcome]?.[key]?.groups || [])).filter((group) => group.flagged).length
        : 0;

    return (
        <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
            <Stack spacing={3}>
                <Box>
                    <Typography variant="overline" color="primary.main" fontWeight={850}>Hire · Compliance</Typography>
                    <Typography component="h1" variant="h4" fontWeight={850}>Fairness report</Typography>
                    <Typography color="text.secondary" mt={1} maxWidth={820}>
                        Compares outcomes across candidates who voluntarily self-identified after submitting. Groups whose rate falls below
                        80% of the highest group’s rate are flagged (the EEOC four-fifths rule of thumb). Individual answers are never shown.
                    </Typography>
                </Box>

                <Alert severity="info">
                    This is an internal monitoring report. It is not an independent bias audit; laws such as NYC Local Law 144 require the audit
                    to be performed by an independent auditor, who can use these same aggregates.
                </Alert>

                <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
                    <FormControl size="small" sx={{ minWidth: 280 }}>
                        <InputLabel id="fairness-assessment-label">Assessment</InputLabel>
                        <Select labelId="fairness-assessment-label" label="Assessment" value={assessmentId} onChange={(event) => setAssessmentId(event.target.value)}>
                            <MenuItem value="">All assessments</MenuItem>
                            {(report?.assessments || []).map((item) => <MenuItem key={item._id} value={item._id}>{item.title}</MenuItem>)}
                        </Select>
                    </FormControl>
                    <Tabs value={grouping} onChange={(_, value) => setGrouping(value)} aria-label="Group candidates by">
                        {GROUPINGS.map((item) => <Tab key={item.key} value={item.key} label={item.label} />)}
                    </Tabs>
                </Stack>

                {loading && <LinearProgress />}
                {error && <Alert severity="error">{error}</Alert>}

                {report && !error && (
                    <>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Chip label={`${report.attempts} submitted candidates`} />
                            <Chip label={`${report.selfIdentified} self-identified`} />
                            <Chip color={flaggedCount ? "warning" : "success"} label={flaggedCount ? `${flaggedCount} group${flaggedCount === 1 ? "" : "s"} below 0.80` : "No groups below 0.80"} />
                        </Stack>
                        <OutcomeTable
                            title="Scoring rate"
                            description={`Share of each group scoring above the median AI score${report.scoring?.median === null ? "" : ` (${report.scoring.median}/10)`}.`}
                            outcome={report.scoring}
                            grouping={grouping}
                            minGroupSize={report.minGroupSize}
                        />
                        <OutcomeTable
                            title="Selection rate"
                            description="Share of each group a reviewer marked “Advance”, among candidates who received a decision."
                            outcome={report.selection}
                            grouping={grouping}
                            minGroupSize={report.minGroupSize}
                        />
                    </>
                )}
            </Stack>
        </Container>
    );
}
