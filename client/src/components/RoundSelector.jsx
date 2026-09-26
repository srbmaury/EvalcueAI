import {
    Box,
    Card,
    CardContent,
    Checkbox,
    Chip,
    FormControl,
    FormControlLabel,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import { AccountTreeRounded, ChatBubbleOutlineRounded, CodeRounded } from "@mui/icons-material";
import { getDefaultQuestionLimit, getQuestionCountCopy, isSystemDesignRound } from "../utils/roundDefaults";

const RoundsSelector = ({ suggestedRounds, selectedRounds, onToggleRound, onChangeMode, onChangeCount }) => (
    <Stack spacing={2}>
        {suggestedRounds.map((round, idx) => {
            const selected = selectedRounds.find((item) => item.roundName === round.roundName);
            const isSelected = Boolean(selected);
            const currentRound = selected || round;
            const systemDesign = isSystemDesignRound(currentRound);
            const countCopy = getQuestionCountCopy(currentRound);
            const mode = currentRound.deliveryMode || "conversational";
            const icon = systemDesign
                ? <AccountTreeRounded fontSize="small" />
                : mode === "online-assessment"
                    ? <CodeRounded fontSize="small" />
                    : <ChatBubbleOutlineRounded fontSize="small" />;

            return (
                <Card key={`${round.roundName}-${idx}`} variant="outlined" sx={{
                    border: "1px solid",
                    borderColor: isSelected ? "primary.main" : "divider",
                    bgcolor: isSelected ? "action.selected" : "background.paper",
                    boxShadow: isSelected ? "0 10px 30px rgba(36,81,199,.10)" : "none",
                    transition: "border-color .18s ease, transform .18s ease, box-shadow .18s ease",
                    "&:hover": { borderColor: "primary.light", transform: "translateY(-1px)" },
                }}>
                    <CardContent>
                        <FormControlLabel
                            sx={{ width: "100%", m: 0, alignItems: "flex-start", ".MuiFormControlLabel-label": { flex: 1 } }}
                            control={<Checkbox checked={isSelected} onChange={() => onToggleRound(round)} />}
                            label={<Box sx={{ pt: .25 }}>
                                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                    <Box sx={{ color: "primary.main", display: "flex" }}>{icon}</Box>
                                    <Typography variant="h6" fontWeight={750}>{round.roundName}</Typography>
                                    {systemDesign && <Chip size="small" color="secondary" variant="outlined" label="Live design discussion" />}
                                    {round.recommended !== false && <Chip size="small" color="primary" variant="outlined" label="AI recommended" />}
                                    {round.recommended === false && <Chip size="small" variant="outlined" label="Optional" />}
                                </Stack>
                                <Typography variant="body2" color="text.secondary" mt={.75} lineHeight={1.6}>{round.description}</Typography>
                                {round.rationale && <Typography variant="caption" color="text.secondary" display="block" mt={1}><strong>Why this round:</strong> {round.rationale}</Typography>}
                                {Array.isArray(round.skills) && round.skills.length > 0 && <Stack direction="row" spacing={.75} mt={1.25} flexWrap="wrap" useFlexGap>{round.skills.map((skill) => <Chip key={skill} size="small" label={skill} />)}</Stack>}
                            </Box>}
                        />

                        {isSelected && (
                            <Stack mt={2} spacing={1.5} direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "flex-start" }}>
                                {systemDesign ? (
                                    <Paper variant="outlined" sx={{ px: 1.5, py: 1.25, flex: 1, bgcolor: "background.paper" }}>
                                        <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                                            <Box>
                                                <Typography variant="body2" fontWeight={750}>Live system design</Typography>
                                                <Typography variant="caption" color="text.secondary">One architecture problem. The AI interviewer can clarify, challenge, and change constraints while you draw and discuss.</Typography>
                                            </Box>
                                            <Chip size="small" color="primary" label="1 design problem" sx={{ flexShrink: 0 }} />
                                        </Stack>
                                    </Paper>
                                ) : (
                                    <>
                                        <FormControl size="small" sx={{ width: { xs: "100%", sm: "auto" }, minWidth: { sm: 220 } }}>
                                            <InputLabel id={`mode-label-${idx}`}>Interview format</InputLabel>
                                            <Select
                                                labelId={`mode-label-${idx}`}
                                                label="Interview format"
                                                value={mode}
                                                onChange={(event) => {
                                                    const nextMode = event.target.value;
                                                    onChangeMode(round.roundName, nextMode);
                                                    onChangeCount?.(round.roundName, getDefaultQuestionLimit({ ...currentRound, deliveryMode: nextMode }));
                                                }}
                                            >
                                                <MenuItem value="conversational">Live conversation (adaptive)</MenuItem>
                                                <MenuItem value="online-assessment">Coding / written assessment</MenuItem>
                                            </Select>
                                        </FormControl>
                                        <Tooltip title={countCopy.helper}>
                                            <TextField
                                                size="small"
                                                label={countCopy.label}
                                                type="number"
                                                value={selected?.questionLimit ?? getDefaultQuestionLimit(currentRound)}
                                                onChange={(event) => onChangeCount?.(round.roundName, Math.max(1, Math.min(10, Number(event.target.value) || 1)))}
                                                inputProps={{ min: 1, max: 10 }}
                                                helperText={countCopy.helper}
                                                sx={{ width: { xs: "100%", sm: 250 } }}
                                            />
                                        </Tooltip>
                                    </>
                                )}
                            </Stack>
                        )}
                    </CardContent>
                </Card>
            );
        })}
    </Stack>
);

export default RoundsSelector;
