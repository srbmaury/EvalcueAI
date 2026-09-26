import { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { MicRounded, StopRounded } from "@mui/icons-material";
import { sanitizeTranscriptSegment } from "../utils/transcriptSanitizer";

const SpeechRecognition = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

// One-time, unscored warm-up before the first round. The answer is only used as background so later
// questions and follow-ups build on the candidate's real experience. Candidates can type or dictate.
export default function CandidateIntroCard({ onSubmit, onSkip }) {
    const [answer, setAnswer] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [dictating, setDictating] = useState(false);
    const recognitionRef = useRef(null);

    useEffect(() => () => { try { recognitionRef.current?.stop(); } catch { /* already stopped */ } }, []);

    const stopDictation = () => {
        try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
        setDictating(false);
    };

    const startDictation = () => {
        if (!SpeechRecognition) return;
        setError("");
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = navigator.language || "en-US";
        recognition.onresult = (event) => {
            const text = Array.from(event.results).slice(event.resultIndex)
                .filter((result) => result.isFinal)
                .map((result) => sanitizeTranscriptSegment(result[0]?.transcript || ""))
                .filter(Boolean)
                .join(" ");
            if (text) setAnswer((current) => `${current}${current && !/\s$/.test(current) ? " " : ""}${text}`.slice(0, 3000));
        };
        recognition.onerror = (event) => {
            if (["not-allowed", "service-not-allowed"].includes(event?.error)) setError("Microphone access is blocked. You can type your introduction instead.");
            setDictating(false);
        };
        recognition.onend = () => setDictating(false);
        recognitionRef.current = recognition;
        try { recognition.start(); setDictating(true); } catch { setDictating(false); }
    };

    const run = async (action) => {
        stopDictation();
        setBusy(true);
        setError("");
        try { await action(); } catch (err) { setError(err?.response?.data?.message || "Could not save your introduction. Try again."); } finally { setBusy(false); }
    };

    return (
        <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 3.5 }, borderRadius: 3 }}>
            <Stack spacing={2}>
                <Box>
                    <Typography variant="overline" color="primary.main" fontWeight={850}>Before we start</Typography>
                    <Typography component="h2" variant="h5" fontWeight={800}>Give me a quick introduction</Typography>
                    <Typography color="text.secondary" mt={.75}>
                        Your current role and one recent project you’re proud of, in a few sentences. It isn’t scored; it just helps the interviewer ask about your real experience instead of guessing.
                    </Typography>
                </Box>
                <TextField
                    label="Your introduction"
                    placeholder="e.g. I’m a backend engineer at a fintech. Recently I rebuilt our payment-status service to cut latency…"
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    multiline
                    minRows={4}
                    inputProps={{ maxLength: 3000 }}
                    helperText={dictating ? "Listening… speak naturally, then press Stop." : `${answer.length}/3000`}
                    fullWidth
                />
                {error && <Alert severity="error">{error}</Alert>}
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} justifyContent="flex-end">
                    {SpeechRecognition && (
                        <Button
                            variant="outlined"
                            color={dictating ? "warning" : "primary"}
                            startIcon={dictating ? <StopRounded /> : <MicRounded />}
                            onClick={dictating ? stopDictation : startDictation}
                            disabled={busy}
                            sx={{ mr: { sm: "auto" } }}
                        >
                            {dictating ? "Stop dictation" : "Dictate instead"}
                        </Button>
                    )}
                    <Button onClick={() => run(onSkip)} disabled={busy}>Skip intro</Button>
                    <Button variant="contained" onClick={() => run(() => onSubmit(answer.trim()))} disabled={busy || !answer.trim()}>
                        {busy ? "Saving…" : "Continue to first question"}
                    </Button>
                </Stack>
            </Stack>
        </Paper>
    );
}
