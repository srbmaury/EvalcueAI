import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, IconButton, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import AddRounded from "@mui/icons-material/AddRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import PlayArrowRounded from "@mui/icons-material/PlayArrowRounded";
import SendRounded from "@mui/icons-material/SendRounded";
import api from "../api/axios";
import DebuggingProjectWorkspace from "./DebuggingProjectWorkspace";
import { deriveDebuggingOverlay } from "../utils/debuggingProject";

const candidateSafeFiles = (files) => (Array.isArray(files) ? files : []).filter((file) => file?.kind !== "hidden_test");
const candidateSafeWorkspace = (data = {}) => ({
    ...data,
    files: candidateSafeFiles(data.files),
    baseFiles: candidateSafeFiles(data.baseFiles || data.files),
    findings: Array.isArray(data.findings) ? data.findings : [],
    testRuns: Array.isArray(data.testRuns) ? data.testRuns : [],
});
const emptyFinding = () => ({ filePath: "", rootCause: "", evidence: "", proposedFix: "" });

function TestResult({ result, final = false }) {
    if (!result) return null;
    return <Alert severity={result.status === "passed" ? "success" : result.status === "failed" ? "warning" : "error"}>
        <Typography fontWeight={800}>{final ? "Final result: " : ""}{Number(result.passed || 0)}/{Number(result.total || 0)} tests passed</Typography>
        {!!result.tests?.length && <Stack spacing={.4} mt={.75}>
            {result.tests.map((test, index) => <Stack key={`${test.name}:${index}`} direction="row" spacing={.75} alignItems="center">
                <Chip size="small" color={test.passed ? "success" : "default"} label={test.passed ? "Passed" : "Failed"} />
                <Typography variant="body2">{test.name || `Test ${index + 1}`}</Typography>
            </Stack>)}
        </Stack>}
    </Alert>;
}

function FindingsPanel({ files, findings, disabled, onChange }) {
    const update = (index, patch) => onChange(findings.map((finding, i) => i === index ? { ...finding, ...patch } : finding));
    const remove = (index) => onChange(findings.filter((_, i) => i !== index));
    return <Paper variant="outlined" sx={{ p: 2, minWidth: 0, height: "fit-content" }}>
        <Stack spacing={1.5}>
            <Stack direction="row" justifyContent="space-between" gap={1} alignItems="center">
                <Box><Typography fontWeight={850}>Findings by file</Typography><Typography variant="caption" color="text.secondary">Attach each issue to the source file where you found it.</Typography></Box>
                {!disabled && <Button size="small" startIcon={<AddRounded />} onClick={() => onChange([...findings, emptyFinding()])}>Add finding</Button>}
            </Stack>
            {!findings.length && <Typography variant="body2" color="text.secondary">Add a finding when you identify a defect or risky implementation.</Typography>}
            {findings.map((finding, index) => <Paper key={index} variant="outlined" sx={{ p: 1.5 }}><Stack spacing={1.25}>
                <Stack direction="row" gap={1} alignItems="center">
                    <TextField select fullWidth size="small" label="Finding file" inputProps={{ "aria-label": "Finding file" }} value={finding.filePath || ""} disabled={disabled} onChange={(e) => update(index, { filePath: e.target.value })}>
                        {files.map((file) => <MenuItem key={file.path} value={file.path}>{file.path}</MenuItem>)}
                    </TextField>
                    {!disabled && <IconButton aria-label={`Remove finding ${index + 1}`} color="error" onClick={() => remove(index)}><DeleteOutlineRounded /></IconButton>}
                </Stack>
                <TextField multiline minRows={3} label="Finding / root cause" inputProps={{ "aria-label": "Finding / root cause" }} value={finding.rootCause || ""} disabled={disabled} onChange={(e) => update(index, { rootCause: e.target.value })} />
                <TextField multiline minRows={2} label="Evidence" value={finding.evidence || ""} disabled={disabled} onChange={(e) => update(index, { evidence: e.target.value })} />
                <TextField multiline minRows={3} label="Proposed fix" inputProps={{ "aria-label": "Proposed fix" }} value={finding.proposedFix || ""} disabled={disabled} onChange={(e) => update(index, { proposedFix: e.target.value })} />
            </Stack></Paper>)}
        </Stack>
    </Paper>;
}

export default function CandidateDebuggingRound({ endpoint, headers, canRun = true, onSubmitted }) {
    const [workspace, setWorkspace] = useState(null);
    const [files, setFiles] = useState([]);
    const [findings, setFindings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [running, setRunning] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [lastSavedAt, setLastSavedAt] = useState(null);
    const dirtyRef = useRef(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const { data } = await api.get(endpoint, { headers, skipAuthRedirect: true });
            const safe = candidateSafeWorkspace(data);
            setWorkspace(safe);
            setFiles(safe.files);
            setFindings(safe.findings);
            dirtyRef.current = false;
        } catch (err) {
            setError(err?.response?.data?.message || "The debugging workspace could not be loaded.");
        } finally {
            setLoading(false);
        }
    }, [endpoint, headers]);

    useEffect(() => { load(); }, [load]);

    const save = useCallback(async (nextFiles = files, nextFindings = findings) => {
        if (!workspace || workspace.submittedAt) return null;
        setSaving(true);
        try {
            const body = workspace.responseMode === "code_fix"
                ? deriveDebuggingOverlay(candidateSafeFiles(workspace.baseFiles || workspace.files || []), candidateSafeFiles(nextFiles))
                : { findings: nextFindings };
            const { data } = await api.put(`${endpoint}/workspace`, body, { headers, skipAuthRedirect: true });
            const safe = candidateSafeWorkspace(data);
            setWorkspace((current) => ({ ...current, ...safe, baseFiles: current?.baseFiles || safe.baseFiles }));
            if (workspace.responseMode === "findings") setFindings(safe.findings);
            setLastSavedAt(new Date().toISOString());
            dirtyRef.current = false;
            return safe;
        } catch (err) {
            setError(err?.response?.data?.message || "Your debugging work could not be saved.");
            return null;
        } finally {
            setSaving(false);
        }
    }, [endpoint, files, findings, headers, workspace]);

    useEffect(() => {
        if (!workspace || !dirtyRef.current || workspace.submittedAt) return undefined;
        const timer = window.setTimeout(() => { save(); }, 900);
        return () => window.clearTimeout(timer);
    }, [files, findings, save, workspace]);

    const changeFiles = (next) => { dirtyRef.current = true; setFiles(candidateSafeFiles(next)); };
    const changeFindings = (next) => { dirtyRef.current = true; setFindings(next); };

    const runTests = async () => {
        setRunning(true); setError("");
        try {
            const saved = await save();
            if (!saved) return;
            const { data } = await api.post(`${endpoint}/run-tests`, {}, { headers, skipAuthRedirect: true });
            setWorkspace((current) => ({ ...current, testRuns: [...(current?.testRuns || []), data] }));
        } catch (err) { setError(err?.response?.data?.message || "Tests could not be run."); }
        finally { setRunning(false); }
    };

    const submitRound = async () => {
        setSubmitting(true); setError("");
        try {
            const saved = await save();
            if (!saved) return;
            const { data } = await api.post(`${endpoint}/submit`, {}, { headers, skipAuthRedirect: true });
            setWorkspace((current) => ({ ...current, submittedAt: new Date().toISOString(), finalEvaluation: data.summary }));
            onSubmitted?.(data.attempt, data.summary);
        } catch (err) { setError(err?.response?.data?.message || "The debugging round could not be submitted."); }
        finally { setSubmitting(false); }
    };

    const latestRun = useMemo(() => workspace?.testRuns?.[workspace.testRuns.length - 1], [workspace?.testRuns]);
    if (loading) return <Paper variant="outlined" sx={{ minHeight: 360, display: "grid", placeItems: "center" }}><CircularProgress /></Paper>;
    if (!workspace) return <Alert severity="error">{error || "Debugging workspace unavailable."}</Alert>;

    const submitted = Boolean(workspace.submittedAt);
    return <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 3 }}><Stack spacing={2}>
        <Box>
            <Typography variant="overline" color="primary.main" fontWeight={850}>Debugging assignment</Typography>
            <Typography component="h2" variant="h5" fontWeight={850} mt={.25}>{workspace.instructions}</Typography>
            <Stack direction="row" spacing={1} mt={1} flexWrap="wrap" useFlexGap>
                <Chip size="small" label={workspace.responseMode === "code_fix" ? "Fix code" : "Submit findings"} />
                <Chip size="small" variant="outlined" label={workspace.runtime} />
                {lastSavedAt && <Chip size="small" color="success" variant="outlined" label={`Saved ${new Date(lastSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`} />}
            </Stack>
        </Box>
        {error && <Alert severity="error">{error}</Alert>}

        {workspace.responseMode === "findings" ? <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0,1.35fr) minmax(320px,.65fr)" }, gap: 2, alignItems: "start" }}>
            <DebuggingProjectWorkspace files={files} runtime={workspace.runtime} readOnly hideHidden />
            <FindingsPanel files={files} findings={findings} disabled={submitted} onChange={changeFindings} />
        </Box> : <DebuggingProjectWorkspace files={files} runtime={workspace.runtime} onFilesChange={changeFiles} readOnly={submitted} hideHidden />}

        {workspace.responseMode === "code_fix" && <Stack spacing={1}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
                <Button variant="outlined" startIcon={running ? <CircularProgress size={18} /> : <PlayArrowRounded />} disabled={running || saving || submitting || !canRun || submitted} onClick={runTests}>{running ? "Running…" : "Run tests"}</Button>
                {!canRun && <Typography variant="caption" color="warning.main">Code execution is currently unavailable.</Typography>}
            </Stack>
            <TestResult result={latestRun} />
        </Stack>}

        {workspace.responseMode === "code_fix" && <TestResult result={workspace.finalEvaluation} final />}

        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1} alignItems={{ sm: "center" }}>
            <Typography variant="caption" color="text.secondary">Autosave keeps your work on the server.</Typography>
            {!submitted && <Button variant="contained" endIcon={submitting ? <CircularProgress size={18} color="inherit" /> : <SendRounded />} disabled={submitting || saving} onClick={submitRound}>{submitting ? "Submitting…" : workspace.responseMode === "code_fix" ? "Submit solution" : "Submit findings"}</Button>}
        </Stack>
    </Stack></Paper>;
}
