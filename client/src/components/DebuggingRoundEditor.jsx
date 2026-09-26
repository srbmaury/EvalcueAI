import { useState } from "react";
import { Alert, Box, Button, Chip, MenuItem, Stack, TextField, Typography } from "@mui/material";
import PlayArrowRounded from "@mui/icons-material/PlayArrowRounded";
import api from "../api/axios";
import { useNotify } from "../context/NotificationContext";
import DebuggingProjectWorkspace from "./DebuggingProjectWorkspace";
import { createDebuggingRound, DEBUGGING_RUNTIMES } from "../utils/debuggingProject";
import { describeError } from "../utils/errorFormatter";

export default function DebuggingRoundEditor({ round, onChange, validation, onValidationChange, runtimes = [] }) {
    const notify = useNotify();
    const fallback = createDebuggingRound();
    const debugging = {
        ...fallback.debugging,
        ...(round?.debugging || {}),
        files: Array.isArray(round?.debugging?.files) && round.debugging.files.length ? round.debugging.files : fallback.debugging.files,
    };
    const availableRuntimes = runtimes.length ? runtimes.map((item) => ({ value: item.runtime, label: item.label })) : DEBUGGING_RUNTIMES;
    // Keep a previously saved runtime selectable even if this deployment no longer offers it.
    const runtimeOptions = availableRuntimes.some((item) => item.value === debugging.runtime)
        ? availableRuntimes
        : [...availableRuntimes, { value: debugging.runtime, label: `${DEBUGGING_RUNTIMES.find((item) => item.value === debugging.runtime)?.label || debugging.runtime} (unavailable here)` }];
    const instruction = round?.questions?.[0]?.text || "";
    const [validating, setValidating] = useState(false);
    const [validationError, setValidationError] = useState("");

    const emit = (patch) => {
        onValidationChange?.(null);
        setValidationError("");
        onChange?.({ ...round, ...patch });
    };
    const updateDebugging = (patch) => emit({ debugging: { ...debugging, ...patch } });
    const changeResponseMode = (responseMode) => {
        if (responseMode === "findings") {
            const sourceOnlyFiles = debugging.files.filter((file) => file.kind === "source");
            updateDebugging({ responseMode, files: sourceOnlyFiles });
            if (!sourceOnlyFiles.length) {
                notify("No source files found. Add at least one source file before selecting this mode.", "warning");
            }
        } else {
            updateDebugging({ responseMode });
            const hasTests = debugging.files.some((file) => file.kind === "hidden_test");
            if (!hasTests) {
                notify("Code-fix mode requires at least one hidden test file. Add test files before validating.", "warning");
            }
        }
    };

    const validateAssignment = async () => {
        setValidating(true);
        setValidationError("");
        try {
            const { data } = await api.post("/assessments/debugging/validate", { instructions: instruction, debugging });
            onValidationChange?.(data);
            if (data?.valid) {
                notify(data.message || "Assignment validated successfully.", "success");
            } else {
                const message = data?.message || "Assignment validation failed.";
                notify(message, "error");
                setValidationError(message);
                onValidationChange?.({ valid: false, message });
            }
        } catch (err) {
            const message = describeError(err, "The assignment could not be validated.");
            notify(message, "error");
            setValidationError(message);
            onValidationChange?.({ valid: false, message });
        } finally {
            setValidating(false);
        }
    };

    return <Stack spacing={2.25}>
        <Box>
            <Typography component="h3" variant="h6" fontWeight={850}>Debugging assignment</Typography>
            <Typography variant="body2" color="text.secondary" mt={0.5}>Author a real multi-file project directly in EvalCueAI.</Typography>
        </Box>

        <TextField
            required
            multiline
            minRows={3}
            label="Assignment instructions"
            inputProps={{ "aria-label": "Assignment instructions" }}
            helperText="Describe the observed bug, constraints, and expected outcome without revealing the root cause."
            value={instruction}
            onChange={(event) => emit({ questionCount: 1, questions: [{ ...(round?.questions?.[0] || {}), text: event.target.value, required: true }] })}
        />

        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField select fullWidth label="Candidate response" value={debugging.responseMode} onChange={(event) => changeResponseMode(event.target.value)}>
                <MenuItem value="code_fix">Fix code</MenuItem>
                <MenuItem value="findings">Submit findings</MenuItem>
            </TextField>
            <TextField select fullWidth label="Runtime" value={debugging.runtime} onChange={(event) => updateDebugging({ runtime: event.target.value })}>
                {runtimeOptions.map((runtime) => <MenuItem key={runtime.value} value={runtime.value}>{runtime.label}</MenuItem>)}
            </TextField>
            <TextField fullWidth label="Entry file (optional)" value={debugging.entryFile || ""} onChange={(event) => updateDebugging({ entryFile: event.target.value })} placeholder="src/index.js" />
        </Stack>

        <Box>
            <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1} mb={1.25}>
                <Box>
                    <Typography fontWeight={850}>Project workspace</Typography>
                    <Typography variant="body2" color="text.secondary">
                        {debugging.responseMode === "code_fix"
                            ? "Create source files and mark recruiter tests as Hidden test. Give each test a candidate-visible name."
                            : "Create source files only. Candidates inspect them read-only and attach findings to specific files."}
                    </Typography>
                </Box>
                <Stack direction="row" spacing={1} alignItems="center">
                    <Chip size="small" variant="outlined" label={`${debugging.files.length} files`} />
                    <Button variant="outlined" startIcon={<PlayArrowRounded />} disabled={validating || !instruction.trim() || !debugging.files.length} onClick={validateAssignment}>{validating ? "Validating…" : "Validate assignment"}</Button>
                </Stack>
            </Stack>
            <DebuggingProjectWorkspace
                files={debugging.files}
                runtime={debugging.runtime}
                onFilesChange={(files) => updateDebugging({ files })}
                allowClassification={debugging.responseMode === "code_fix"}
            />
        </Box>

        {debugging.responseMode === "code_fix" && <Alert severity="info">Candidates can run recruiter tests and see only the display name plus pass/fail status. Test files themselves remain private.</Alert>}
        {debugging.responseMode === "findings" && <Alert severity="info">Candidates receive the project read-only and add findings against specific project files. This mode has no test files or code execution.</Alert>}
        {validation?.valid && <Alert severity="success">{validation.message || "Assignment validated. The project can be published."}</Alert>}
        {(validationError || validation?.valid === false) && <Alert severity="error">{validationError || validation.message || "Assignment validation failed."}</Alert>}
    </Stack>;
}

// eslint-disable-next-line react-refresh/only-export-components
export { createDebuggingRound };
