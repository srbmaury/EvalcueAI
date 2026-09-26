import { Box, Button, Chip, Paper, Stack, TextField, Typography } from "@mui/material";
import CodeEditorField from "./CodeEditorField";
import VoiceControls from "./VoiceControls";

const SUGGESTS_CODE = /\b(code|coding|implement|algorithm|function|class|program|query|endpoint|api|script)\b/i;

// Multi-problem online assessment: problem statement and navigation on the left, editor on the right.
// The page owns saving and navigation; this renders one problem of the active round.
export default function CandidateOnlineAssessmentRound({
    round, question, questionIndex, draftKey, busy, dirty,
    voiceControlsProps, codeEditorProps, cameraSlot,
    codingEnabled, onCodingModeChange,
    onAnswerChange, onAnswerFocus, explanation, onExplanationChange,
    pendingFollowUp, onFollowUpAnswerChange, onSaveFollowUp,
    onSelectQuestion, onSave,
}) {
    const questionCount = round.questions.length;
    const isLast = questionIndex === questionCount - 1;
    const status = dirty ? ["warning", "Unsaved draft"] : question.answer ? ["success", "Saved"] : ["default", "Not answered"];
    return (
        <Paper variant="outlined" sx={{ overflow: "hidden", borderRadius: 3, position: "relative" }}>
            <Box sx={{ px: 2.5, py: 1.5, bgcolor: "action.hover", borderBottom: "1px solid", borderColor: "divider" }}>
                <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1} alignItems={{ sm: "center" }}>
                    <Box>
                        <Typography variant="overline" color="primary.main" fontWeight={850}>Online assessment · Problem {questionIndex + 1} of {questionCount}</Typography>
                        <Typography variant="body2" color="text.secondary">Move freely between problems. The round only finishes after every problem has a saved response.</Typography>
                    </Box>
                    <Chip size="small" color={status[0]} label={status[1]} />
                </Stack>
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(300px,.7fr) minmax(0,1.3fr)" }, minHeight: { lg: 580 } }}>
                <Box sx={{ p: 2.5, borderRight: { lg: "1px solid" }, borderBottom: { xs: "1px solid", lg: 0 }, borderColor: "divider" }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={850}>PROBLEM STATEMENT</Typography>
                    <Typography component="h2" variant="h5" fontWeight={850} sx={{ lineHeight: 1.45, mt: .5 }}>{question.text}</Typography>
                    <Box sx={{ mt: 2 }}><VoiceControls speakText={question.text} handsFree {...voiceControlsProps} /></Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={850} display="block" mt={3}>PROBLEM NAVIGATION</Typography>
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: .75, mt: 1 }}>
                        {round.questions.map((item, index) => (
                            <Button key={item._id} size="small" variant={index === questionIndex ? "contained" : "outlined"} color={item.answer ? "success" : "primary"} onClick={() => onSelectQuestion(index)}>{index + 1}</Button>
                        ))}
                    </Box>
                </Box>
                <Box sx={{ p: 2.5, minWidth: 0, bgcolor: "background.default" }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={850}>WORKSPACE</Typography>
                    <Box mt={1}>
                        <CodeEditorField
                            questionText={question.text || ""}
                            value={question.answer || ""}
                            onChange={onAnswerChange}
                            onFocus={onAnswerFocus}
                            minRows={16}
                            draftKey={draftKey}
                            suggestCode={SUGGESTS_CODE.test(question.text)}
                            onModeChange={onCodingModeChange}
                            skipAuthRedirect
                            {...codeEditorProps}
                        />
                    </Box>
                    {codingEnabled && <TextField fullWidth multiline minRows={3} sx={{ mt: 2 }} label="Explain your approach" value={explanation} onChange={(event) => onExplanationChange(event.target.value)} />}
                    {pendingFollowUp && (
                        <Paper variant="outlined" sx={{ p: 2, mt: 2, borderColor: "primary.main" }}>
                            <Typography variant="caption" color="primary.main" fontWeight={850}>INTERVIEWER FOLLOW-UP</Typography>
                            <Typography fontWeight={750}>{pendingFollowUp.question}</Typography>
                            <TextField fullWidth multiline minRows={3} sx={{ mt: 1 }} label="Your follow-up answer" value={question.followUpAnswer || ""} onChange={(event) => onFollowUpAnswerChange(event.target.value)} />
                            <Button sx={{ mt: 1 }} variant="contained" disabled={busy || !question.followUpAnswer?.trim()} onClick={onSaveFollowUp}>Save follow-up</Button>
                        </Paper>
                    )}
                    {/* Scoped to its own sized slot (matching Practice's OAForm) rather than floating relative to the
                        whole round Paper, which let the tile drift over the footer's save button and block clicks. */}
                    <Box data-testid="online-assessment-camera-slot" sx={{ position: "relative", height: { xs: 104, sm: 131 }, mt: 2 }}>{cameraSlot}</Box>
                </Box>
            </Box>
            <Box sx={{ px: 2.5, py: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
                <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1}>
                    <Stack direction="row" spacing={1}>
                        <Button disabled={questionIndex === 0 || busy} onClick={() => onSelectQuestion(Math.max(0, questionIndex - 1))}>Previous</Button>
                        {!isLast && <Button variant="outlined" disabled={busy} onClick={() => onSelectQuestion(Math.min(questionCount - 1, questionIndex + 1))}>Next problem</Button>}
                    </Stack>
                    <Button variant="contained" disabled={busy || !question.answer?.trim() || Boolean(pendingFollowUp)} onClick={onSave}>{busy ? "Saving…" : isLast ? "Save and review round" : "Save and continue"}</Button>
                </Stack>
            </Box>
        </Paper>
    );
}
