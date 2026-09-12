import { useState } from "react";
import { Alert, Box, Button, Chip, MenuItem, Stack, TextField, Typography } from "@mui/material";
import PlayArrowRounded from "@mui/icons-material/PlayArrowRounded";
import api from "../api/axios";
import DebuggingProjectWorkspace from "./DebuggingProjectWorkspace";
import { createDebuggingRound, DEBUGGING_RUNTIMES } from "../utils/debuggingProject";

export default function DebuggingRoundEditor({ round, onChange, validation, onValidationChange }) {
    const fallback = createDebuggingRound();
    const debugging = {
        ...fallback.debugging,
        ...(round?.debugging || {}),
        files: Array.isArray(round?.debugging?.files) && round.debugging.files.length
            ? round.debugging.files
            : fallback.debugging.files,
    };
    const instruction = round?.questions?.[0]?.text || "";
    const [validating, setValidating] = useState(false);
    const [validationError, setValidationError] = useState("");

    const emit = (patch) => {
        onValidationChange?.(null);
        setValidationError("");
        onChange?.({ ...round, ...patch });
    };
    const updateDebugging = (patch) => emit({ debugging: { ...debugging, ...patch } });

    const validateAssignment = async () => {
        setValidating(true);
        setValidationError("");
        try {
            const { data } = await api.post("/assessments/debugging/validate", {
                instructions: instruction,
                debugging,
            });
            onValidationChange?.(data);
        } catch (err) {
            const message = err?.response?.data?.message || "The assignment could not be validated.";
            setValidationError(message);
            onValidationChange?.({ valid: false, message });
        } finally {
            setValidating(false);
        }
    };

    return (
        <Stack spacing={2.25}>
            <Box>
                <Typography component="h3" variant="h6" fontWeight={850}>Debugging assignment</Typography>
                <Typography variant="body2" color="text.secondary" mt={0.5}>
                    Author a real multi-file project. Candidates inspect the codebase, diagnose the defect, and either fix it or document their findings.
                </Typography>
            </Box>

            <TextField required multiline minRows={3} label="Assignment instructions" helperText="Describe the observed bug, constraints, and expected outcome without revealing the root cause." value={instruction} onChange={(event) => emit({
                questionCount: 1,
                questions: [{ ...(round?.questions?.[0] || {}), text: event.target.value, required: true }],
            })} />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField select fullWidth label="Candidate response" value={debugging.responseMode} onChange={(event) => updateDebugging({ responseMode: event.target.value })}>
                    <MenuItem value="code_fix">Fix code</MenuItem>
                    <MenuItem value="findings">Submit findings</MenuItem>
                </TextField>
                <TextField select fullWidth label="Runtime" value={debugging.runtime} onChange={(event) => updateDebugging({ runtime: event.target.value })}>
                    {DEBUGGING_RUNTIMES.map((runtime) => <MenuItem key={runtime.value} value={runtime.value}>{runtime.label}</MenuItem>)}
                </TextField>
                <TextField fullWidth label="Entry file (optional)" value={debugging.entryFile || ""} onChange={(event) => updateDebugging({ entryFile: event.target.value })} placeholder="src/index.js" />
            </Stack>

            <Box>
                <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1} mb={1.25}>
                    <Box>
                        <Typography fontWeight={850}>Project workspace</Typography>
                        <Typography variant="body2" color="text.secondary">Create the project in place. Mark test files as visible or hidden; hidden tests never reach candidates.</Typography>
                    </Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <Chip size="small" variant="outlined" label={`${debugging.files.length} files`} />
                        <Button variant="outlined" startIcon={<PlayArrowRounded />} disabled={validating || !instruction.trim() || !debugging.files.length} onClick={validateAssignment}>
                            {validating ? "Validating…" : "Validate assignment"}
                        </Button>
                    </Stack>
                </Stack>
                <DebuggingProjectWorkspace files={debugging.files} runtime={debugging.runtime} onFilesChange={(files) => updateDebugging({ files })} allowClassification />
            </Box>

            {debugging.responseMode === "findings" && <Alert severity="info">Candidates receive this project read-only and submit root cause, evidence, proposed fix, impact/risk, and testing strategy. No code execution is required.</Alert>}
            {validation?.valid && <Alert severity="success">{validation.message || "Assignment validated. The project can be published."}</Alert>}
            {(validationError || validation?.valid === false) && <Alert severity="error">{validationError || validation.message || "Assignment validation failed."}</Alert>}
        </Stack>
    );
}

// Compatibility while the assessment builder import is migrated to the utility module.
// eslint-disable-next-line react-refresh/only-export-components
export { createDebuggingRound };
