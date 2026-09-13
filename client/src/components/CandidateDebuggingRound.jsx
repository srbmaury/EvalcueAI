import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Paper, Stack, TextField, Typography } from "@mui/material";
import PlayArrowRounded from "@mui/icons-material/PlayArrowRounded";
import SendRounded from "@mui/icons-material/SendRounded";
import api from "../api/axios";
import DebuggingProjectWorkspace from "./DebuggingProjectWorkspace";
import { deriveDebuggingOverlay } from "../utils/debuggingProject";

const emptyFindings = { rootCause: "", evidence: "", proposedFix: "", impact: "", testingStrategy: "" };
const candidateSafeFiles = (files) => (Array.isArray(files) ? files : []).filter((file) => file?.kind !== "hidden_test");
const candidateSafeWorkspace = (data = {}) => ({
    ...data,
    files: candidateSafeFiles(data.files),
    baseFiles: candidateSafeFiles(data.baseFiles || data.files),
});

export default function CandidateDebuggingRound({ endpoint, headers, canRun = true, onSubmitted }) {
    const [workspace, setWorkspace] = useState(null);
    const [files, setFiles] = useState([]);
    const [findings, setFindings] = useState(emptyFindings);
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
            setFindings({ ...emptyFindings, ...(data.findings || {}) });
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
    const changeFinding = (key, value) => { dirtyRef.current = true; setFindings((current) => ({ ...current, [key]: value })); };

    const runTests = async () => {
        setRunning(true); setError("");
        try {
            const saved = await save();
            if (!saved) return;
            const { data } = await api.post(`${endpoint}/run-tests`, {}, { headers, skipAuthRedirect: true });
            setWorkspace((current) => ({ ...current, visibleTestRuns: [...(current?.visibleTestRuns || []), data] }));
        } catch (err) { setError(err?.response?.data?.message || "Visible tests could not be run."); }
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

    const latestRun = useMemo(() => workspace?.visibleTestRuns?.[workspace.visibleTestRuns.length - 1], [workspace?.visibleTestRuns]);
    if (loading) return <Paper variant="outlined" sx={{ minHeight: 360, display: "grid", placeItems: "center" }}><CircularProgress /></Paper>;
    if (!workspace) return <Alert severity="error">{error || "Debugging workspace unavailable."}</Alert>;

    return <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 3 }}>
        <Stack spacing={2}>
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
            <DebuggingProjectWorkspace files={files} runtime={workspace.runtime} onFilesChange={changeFiles} readOnly={workspace.responseMode === "findings" || Boolean(workspace.submittedAt)} protectTests hideHidden />

            {workspace.responseMode === "findings" && <Stack spacing={1.5}>
                <Typography fontWeight={850}>Your findings</Typography>
                <TextField multiline minRows={3} label="Root cause" value={findings.rootCause} onChange={(e) => changeFinding("rootCause", e.target.value)} disabled={Boolean(workspace.submittedAt)} />
                <TextField multiline minRows={3} label="Evidence from the code" value={findings.evidence} onChange={(e) => changeFinding("evidence", e.target.value)} disabled={Boolean(workspace.submittedAt)} />
                <TextField multiline minRows={3} label="Proposed fix" value={findings.proposedFix} onChange={(e) => changeFinding("proposedFix", e.target.value)} disabled={Boolean(workspace.submittedAt)} />
                <TextField multiline minRows={2} label="Impact / risk" value={findings.impact} onChange={(e) => changeFinding("impact", e.target.value)} disabled={Boolean(workspace.submittedAt)} />
                <TextField multiline minRows={3} label="Testing strategy" value={findings.testingStrategy} onChange={(e) => changeFinding("testingStrategy", e.target.value)} disabled={Boolean(workspace.submittedAt)} />
            </Stack>}

            {workspace.responseMode === "code_fix" && <Stack spacing={1}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
                    <Button variant="outlined" startIcon={running ? <CircularProgress size={18} /> : <PlayArrowRounded />} disabled={running || saving || submitting || !canRun || Boolean(workspace.submittedAt)} onClick={runTests}>{running ? "Running…" : "Run visible tests"}</Button>
                    {!canRun && <Typography variant="caption" color="warning.main">Code execution is currently unavailable.</Typography>}
                </Stack>
                {latestRun && <Alert severity={latestRun.status === "passed" ? "success" : "warning"}>
                    Visible tests: {latestRun.visiblePassed}/{latestRun.visibleTotal} passed.
                    {(latestRun.visibleFailures || []).map((failure) => <Typography key={`${failure.name}:${failure.message}`} variant="body2" mt={.5}>{failure.name}: {failure.message}</Typography>)}
                </Alert>}
            </Stack>}

            {workspace.finalEvaluation && workspace.responseMode === "code_fix" && <Alert severity={workspace.finalEvaluation.status === "passed" ? "success" : "info"}>Final result: visible {workspace.finalEvaluation.visiblePassed}/{workspace.finalEvaluation.visibleTotal}, hidden {workspace.finalEvaluation.hiddenPassed}/{workspace.finalEvaluation.hiddenTotal}.</Alert>}

            <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1} alignItems={{ sm: "center" }}>
                <Typography variant="caption" color="text.secondary">Autosave keeps your workspace on the server. Hidden tests run only on final submission.</Typography>
                {!workspace.submittedAt && <Button variant="contained" endIcon={submitting ? <CircularProgress size={18} color="inherit" /> : <SendRounded />} disabled={submitting || saving} onClick={submitRound}>{submitting ? "Submitting…" : workspace.responseMode === "code_fix" ? "Submit solution" : "Submit findings"}</Button>}
            </Stack>
        </Stack>
    </Paper>;
}
