import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Chip, Container, Paper, Stack, Typography } from "@mui/material";
import api from "../api/axios";

const diffPaths = (diff = {}) => {
    if (Array.isArray(diff.paths)) return diff.paths;
    if (!diff.paths || typeof diff.paths !== "object") return [];
    return [...(diff.paths.changed || []), ...(diff.paths.created || []), ...(diff.paths.deleted || [])];
};

function CodeFixEvidence({ response }) {
    const result = response?.finalEvaluation || {};
    const diff = result.diff || {};
    const paths = diffPaths(diff);
    const changed = Number(diff.changed || 0) + Number(diff.created || 0) + Number(diff.deleted || 0);
    const status = String(result.status || "submitted").replaceAll("_", " ");
    return <Stack spacing={1.25}>
        <Stack direction="row" gap={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" label={status} color={result.status === "passed" ? "success" : result.status === "failed" ? "warning" : "default"} />
            <Chip size="small" variant="outlined" label={`${changed} files changed`} />
            <Chip size="small" variant="outlined" label={`Tests ${Number(result.passed || 0)}/${Number(result.total || 0)}`} />
        </Stack>
        {!!result.tests?.length && <Box>
            <Typography variant="caption" color="text.secondary" fontWeight={800}>TEST RESULTS</Typography>
            <Stack spacing={.5} mt={.5}>{result.tests.map((test, index) => <Stack direction="row" spacing={.75} alignItems="center" key={`${test.name}:${index}`}><Chip size="small" label={test.passed ? "Passed" : "Failed"} color={test.passed ? "success" : "default"} /><Typography variant="body2">{test.name}</Typography></Stack>)}</Stack>
        </Box>}
        {paths.length > 0 && <Box>
            <Typography variant="caption" color="text.secondary" fontWeight={800}>CHANGED PATHS</Typography>
            <Stack component="ul" spacing={0.25} sx={{ mt: .5, mb: 0, pl: 2.5 }}>{paths.map((path) => <Typography component="li" variant="body2" key={path} sx={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", overflowWrap: "anywhere" }}>{path}</Typography>)}</Stack>
        </Box>}
        <Typography variant="caption" color="text.secondary">Recruiter test implementation remains private; reports contain candidate-safe names and pass/fail status only.</Typography>
    </Stack>;
}

function FindingsEvidence({ response }) {
    const findings = Array.isArray(response?.findings) ? response.findings : [];
    return <Stack spacing={1.5}>
        {findings.map((finding, index) => <Paper key={`${finding.filePath}:${index}`} variant="outlined" sx={{ p: 1.5 }}><Stack spacing={1}>
            <Typography fontWeight={850} sx={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", overflowWrap: "anywhere" }}>{finding.filePath}</Typography>
            <Box><Typography variant="caption" color="text.secondary" fontWeight={800}>Finding / root cause</Typography><Typography sx={{ whiteSpace: "pre-wrap", mt: .25 }}>{finding.rootCause || "Not provided"}</Typography></Box>
            {finding.evidence && <Box><Typography variant="caption" color="text.secondary" fontWeight={800}>Evidence</Typography><Typography sx={{ whiteSpace: "pre-wrap", mt: .25 }}>{finding.evidence}</Typography></Box>}
            {finding.proposedFix && <Box><Typography variant="caption" color="text.secondary" fontWeight={800}>Proposed fix</Typography><Typography sx={{ whiteSpace: "pre-wrap", mt: .25 }}>{finding.proposedFix}</Typography></Box>}
        </Stack></Paper>)}
        {!findings.length && <Typography color="text.secondary">No findings were submitted.</Typography>}
    </Stack>;
}

function DebuggingResponseCard({ attempt, response }) {
    const roundIndex = Number(response?.roundIndex || 0);
    const round = attempt?.rounds?.[roundIndex];
    return <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 3 }}><Stack spacing={1.5}>
        <Box><Typography variant="overline" color="primary.main" fontWeight={850}>Debugging assignment</Typography><Typography component="h4" variant="h6" fontWeight={850}>{round?.name || `Round ${roundIndex + 1}`}</Typography>{round?.questions?.[0]?.text && <Typography variant="body2" color="text.secondary" mt={.25}>{round.questions[0].text}</Typography>}</Box>
        {response?.responseMode === "findings" ? <FindingsEvidence response={response} /> : <CodeFixEvidence response={response} />}
    </Stack></Paper>;
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
    return <Container maxWidth="lg" sx={{ pb: { xs: 4, md: 6 } }}>
        {error ? <Alert severity="warning">{error}</Alert> : <Stack spacing={2}>
            <Box><Typography component="h2" variant="h5" fontWeight={850}>Debugging evidence</Typography><Typography variant="body2" color="text.secondary" mt={.5}>Test outcomes and candidate-authored file findings are shown separately from AI scoring.</Typography></Box>
            {withDebugging.map((attempt) => <Paper key={attempt._id} variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 3 }}><Typography component="h3" variant="h6" fontWeight={850}>{attempt.candidateName}</Typography><Typography variant="body2" color="text.secondary" mb={1.5}>{attempt.candidateEmail}</Typography><Stack spacing={1.5}>{attempt.debuggingResponses.map((response) => <DebuggingResponseCard key={`${attempt._id}:${response.roundIndex}`} attempt={attempt} response={response} />)}</Stack></Paper>)}
        </Stack>}
    </Container>;
}
