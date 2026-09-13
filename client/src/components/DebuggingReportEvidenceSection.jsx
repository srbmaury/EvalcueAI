import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Chip, Container, Paper, Stack, Typography } from "@mui/material";
import api from "../api/axios";

const findingRows = [
    ["Root cause", "rootCause"],
    ["Evidence", "evidence"],
    ["Proposed fix", "proposedFix"],
    ["Impact / risk", "impact"],
    ["Testing strategy", "testingStrategy"],
];

function CodeFixEvidence({ response }) {
    const result = response?.finalEvaluation || {};
    const diff = result.diff || {};
    const paths = Array.isArray(diff.paths) ? diff.paths : [];
    const changed = Number(diff.changed || 0) + Number(diff.created || 0) + Number(diff.deleted || 0);
    const status = String(result.status || "submitted").replaceAll("_", " ");
    return (
        <Stack spacing={1.25}>
            <Stack direction="row" gap={1} flexWrap="wrap" useFlexGap>
                <Chip size="small" label={status} color={result.status === "passed" ? "success" : result.status === "failed" ? "warning" : "default"} />
                <Chip size="small" variant="outlined" label={`${changed} files changed`} />
                <Chip size="small" variant="outlined" label={`Visible tests ${Number(result.visiblePassed || 0)}/${Number(result.visibleTotal || 0)}`} />
                <Chip size="small" variant="outlined" label={`Hidden tests ${Number(result.hiddenPassed || 0)}/${Number(result.hiddenTotal || 0)}`} />
            </Stack>
            {paths.length > 0 && (
                <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={800}>CHANGED PATHS</Typography>
                    <Stack component="ul" spacing={0.25} sx={{ mt: .5, mb: 0, pl: 2.5 }}>
                        {paths.map((path) => <Typography component="li" variant="body2" key={path} sx={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", overflowWrap: "anywhere" }}>{path}</Typography>)}
                    </Stack>
                </Box>
            )}
            <Typography variant="caption" color="text.secondary">Hidden test definitions and diagnostics are intentionally not exposed; only aggregate results are shown.</Typography>
        </Stack>
    );
}

function FindingsEvidence({ response }) {
    const findings = response?.findings || {};
    return (
        <Stack spacing={1.5}>
            {findingRows.map(([label, key]) => (
                <Box key={key}>
                    <Typography variant="caption" color="text.secondary" fontWeight={800}>{label}</Typography>
                    <Typography sx={{ whiteSpace: "pre-wrap", mt: .25 }}>{findings[key] || "Not provided"}</Typography>
                </Box>
            ))}
        </Stack>
    );
}

function DebuggingResponseCard({ attempt, response }) {
    const roundIndex = Number(response?.roundIndex || 0);
    const round = attempt?.rounds?.[roundIndex];
    return (
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 3 }}>
            <Stack spacing={1.5}>
                <Box>
                    <Typography variant="overline" color="primary.main" fontWeight={850}>Debugging assignment</Typography>
                    <Typography component="h4" variant="h6" fontWeight={850}>{round?.name || `Round ${roundIndex + 1}`}</Typography>
                    {round?.questions?.[0]?.text && <Typography variant="body2" color="text.secondary" mt={.25}>{round.questions[0].text}</Typography>}
                </Box>
                {response?.responseMode === "findings" ? <FindingsEvidence response={response} /> : <CodeFixEvidence response={response} />}
            </Stack>
        </Paper>
    );
}

export default function DebuggingReportEvidenceSection({ assessmentId }) {
    const [attempts, setAttempts] = useState([]);
    const [error, setError] = useState("");

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const { data } = await api.get(`/assessments/${assessmentId}`);
                if (active) setAttempts(Array.isArray(data?.attempts) ? data.attempts : []);
            } catch {
                if (active) setError("Debugging evidence could not be loaded.");
            }
        })();
        return () => { active = false; };
    }, [assessmentId]);

    const withDebugging = useMemo(() => attempts
        .map((attempt) => ({ ...attempt, debuggingResponses: (attempt.debuggingResponses || []).filter((response) => response?.submittedAt || response?.finalEvaluation) }))
        .filter((attempt) => attempt.debuggingResponses.length > 0), [attempts]);

    if (!withDebugging.length && !error) return null;

    return (
        <Container maxWidth="lg" sx={{ pb: { xs: 4, md: 6 } }}>
            {error ? <Alert severity="warning">{error}</Alert> : (
                <Stack spacing={2}>
                    <Box>
                        <Typography component="h2" variant="h5" fontWeight={850}>Debugging evidence</Typography>
                        <Typography variant="body2" color="text.secondary" mt={.5}>Deterministic test results and candidate-authored diagnostic evidence are shown separately from AI scoring.</Typography>
                    </Box>
                    {withDebugging.map((attempt) => (
                        <Paper key={attempt._id} variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 3 }}>
                            <Typography component="h3" variant="h6" fontWeight={850}>{attempt.candidateName}</Typography>
                            <Typography variant="body2" color="text.secondary" mb={1.5}>{attempt.candidateEmail}</Typography>
                            <Stack spacing={1.5}>
                                {attempt.debuggingResponses.map((response) => <DebuggingResponseCard key={`${attempt._id}:${response.roundIndex}`} attempt={attempt} response={response} />)}
                            </Stack>
                        </Paper>
                    ))}
                </Stack>
            )}
        </Container>
    );
}
