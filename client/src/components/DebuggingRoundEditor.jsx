import AddRounded from "@mui/icons-material/AddRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Divider,
    FormControlLabel,
    IconButton,
    MenuItem,
    Paper,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import CodeEditorField from "./CodeEditorField";

const emptyTest = () => ({ name: "", stdin: "", expectedOutput: "", hidden: false });

const defaultDebugging = {
    responseMode: "code_fix",
    language: "javascript",
    starterCode: "",
    tests: [emptyTest()],
};

export const createDebuggingRound = () => ({
    name: "Debugging",
    description: "Debug unfamiliar code and explain the root cause.",
    deliveryMode: "debugging",
    adaptive: false,
    questionCount: 1,
    aiPrompt: "",
    questions: [{ text: "", required: true }],
    debugging: { ...defaultDebugging, tests: [emptyTest()] },
});

export default function DebuggingRoundEditor({ round, onChange }) {
    const debugging = {
        ...defaultDebugging,
        ...(round?.debugging || {}),
        tests: Array.isArray(round?.debugging?.tests)
            ? round.debugging.tests
            : defaultDebugging.tests,
    };
    const instruction = round?.questions?.[0]?.text || "";

    const emit = (patch) => onChange?.({ ...round, ...patch });
    const updateDebugging = (patch) => emit({
        debugging: {
            ...debugging,
            ...patch,
        },
    });
    const updateTest = (index, patch) => updateDebugging({
        tests: debugging.tests.map((test, position) => position === index ? { ...test, ...patch } : test),
    });
    const removeTest = (index) => updateDebugging({
        tests: debugging.tests.filter((_, position) => position !== index),
    });

    const changeResponseMode = (responseMode) => {
        updateDebugging({
            responseMode,
            tests: responseMode === "findings"
                ? []
                : debugging.tests.length
                    ? debugging.tests
                    : [emptyTest()],
        });
    };

    return (
        <Stack spacing={2.25}>
            <Box>
                <Typography component="h3" variant="h6" fontWeight={850}>Debugging assignment</Typography>
                <Typography variant="body2" color="text.secondary" mt={0.5}>
                    Give candidates buggy code and measure how they diagnose the failure, not just whether they can start from a blank editor.
                </Typography>
            </Box>

            <TextField
                required
                multiline
                minRows={3}
                label="Assignment instructions"
                helperText="Describe the observed bug, relevant constraints, and what the candidate should accomplish without revealing the root cause."
                value={instruction}
                onChange={(event) => emit({
                    questionCount: 1,
                    questions: [{
                        ...(round?.questions?.[0] || {}),
                        text: event.target.value,
                        required: true,
                    }],
                })}
            />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                    select
                    fullWidth
                    label="Candidate response"
                    value={debugging.responseMode}
                    onChange={(event) => changeResponseMode(event.target.value)}
                >
                    <MenuItem value="code_fix">Fix code</MenuItem>
                    <MenuItem value="findings">Submit findings</MenuItem>
                </TextField>
                <TextField
                    select
                    fullWidth
                    label="Language"
                    value={debugging.language}
                    onChange={(event) => updateDebugging({ language: event.target.value })}
                >
                    <MenuItem value="javascript">JavaScript</MenuItem>
                    <MenuItem value="python">Python</MenuItem>
                    <MenuItem value="java">Java</MenuItem>
                    <MenuItem value="cpp">C++</MenuItem>
                </TextField>
            </Stack>

            <Box>
                <Typography fontWeight={800} mb={1}>Starter code</Typography>
                <CodeEditorField
                    label="Starter code"
                    value={debugging.starterCode}
                    language={debugging.language}
                    height="320px"
                    onChange={(value) => updateDebugging({ starterCode: value })}
                />
                <Typography variant="caption" color="text.secondary" display="block" mt={0.75}>
                    Candidates receive this code as the immutable starting point for the assignment.
                </Typography>
            </Box>

            {debugging.responseMode === "findings" ? (
                <Alert severity="info">
                    Candidates will document root cause, evidence from the code, proposed fix, and testing strategy. The starter code is read-only for them and no execution tests are required.
                </Alert>
            ) : (
                <Stack spacing={1.5}>
                    <Divider />
                    <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1} alignItems={{ sm: "center" }}>
                        <Box>
                            <Typography fontWeight={850}>Tests</Typography>
                            <Typography variant="body2" color="text.secondary">
                                Visible tests show their output. Hidden tests reveal only aggregate pass counts.
                            </Typography>
                        </Box>
                        <Button
                            size="small"
                            variant="outlined"
                            startIcon={<AddRounded />}
                            disabled={debugging.tests.length >= 12}
                            onClick={() => updateDebugging({ tests: [...debugging.tests, emptyTest()] })}
                        >
                            Add test
                        </Button>
                    </Stack>

                    {debugging.tests.map((test, index) => (
                        <Paper key={index} variant="outlined" sx={{ p: 2 }}>
                            <Stack spacing={1.5}>
                                <Stack direction={{ xs: "column", sm: "row" }} gap={1} alignItems={{ sm: "flex-start" }}>
                                    <TextField
                                        fullWidth
                                        required
                                        label={`Test name ${index + 1}`}
                                        value={test.name || ""}
                                        onChange={(event) => updateTest(index, { name: event.target.value })}
                                    />
                                    <FormControlLabel
                                        control={(
                                            <Checkbox
                                                checked={Boolean(test.hidden)}
                                                onChange={(event) => updateTest(index, { hidden: event.target.checked })}
                                                inputProps={{ "aria-label": `Hidden test ${index + 1}` }}
                                            />
                                        )}
                                        label="Hidden"
                                    />
                                    {debugging.tests.length > 1 && (
                                        <IconButton aria-label={`Remove test ${index + 1}`} onClick={() => removeTest(index)}>
                                            <DeleteOutlineRounded />
                                        </IconButton>
                                    )}
                                </Stack>
                                <TextField
                                    multiline
                                    minRows={2}
                                    label={`Standard input ${index + 1}`}
                                    value={test.stdin || ""}
                                    onChange={(event) => updateTest(index, { stdin: event.target.value })}
                                />
                                <TextField
                                    required
                                    multiline
                                    minRows={2}
                                    label={`Expected output ${index + 1}`}
                                    value={test.expectedOutput || ""}
                                    onChange={(event) => updateTest(index, { expectedOutput: event.target.value })}
                                />
                            </Stack>
                        </Paper>
                    ))}
                </Stack>
            )}
        </Stack>
    );
}
