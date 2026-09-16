import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Container, LinearProgress, Paper, Stack, TextField, Typography } from "@mui/material";
import { EmojiEventsRounded, FindInPageRounded } from "@mui/icons-material";
import api from "../api/axios";
import JobPostImporter from "../components/JobPostImporter";
import { useNotify } from "../context/NotificationContext";
import { trackEvent } from "../utils/analytics";
import { describeError } from "../utils/errorFormatter";

export default function ResumeMatcherPage() {
    const navigate = useNavigate();
    const notify = useNotify();
    const [role, setRole] = useState("");
    const [jobDescription, setJobDescription] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);

    const findMatches = async () => {
        if (jobDescription.trim().length < 40) { notify("Add a more complete job description before matching resumes.", "warning"); return; }
        setLoading(true); setResult(null);
        try {
            const { data } = await api.post("/resumes/match", { role: role.trim(), jobDescription: jobDescription.trim() });
            setResult(data); trackEvent("resume_match_completed");
            notify(`Compared ${data.resumeCount} resume${data.resumeCount === 1 ? "" : "s"}.`, "success");
        } catch (error) { notify(describeError(error, "Resumes could not be matched to this job."), "error"); }
        finally { setLoading(false); }
    };

    return <Container maxWidth="lg" sx={{ py: { xs: 3, md: 6 } }}>
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={2} mb={3}><Box><Typography variant="overline" color="primary.main" fontWeight={800}>Resume intelligence</Typography><Typography component="h1" variant="h3" sx={{ fontSize: { xs: "2.35rem", md: "3rem" } }} fontWeight={850}>Find your best resume for a job</Typography><Typography color="text.secondary" mt={1}>Compare every resume in your workspace against one job description. Matching is private, fast, and does not use an AI-review allowance.</Typography></Box><Button variant="outlined" onClick={() => navigate("/practice/resumes")}>Manage resumes</Button></Stack>
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, mb: 3 }}><Stack spacing={2}><JobPostImporter onImport={({ jobRole, jobDescription: description }) => { setRole(jobRole); setJobDescription(description); }} /><TextField label="Target role (optional)" value={role} onChange={(event) => setRole(event.target.value)} /><TextField required multiline minRows={7} label="Job description" helperText={`${jobDescription.length}/12000 · Include responsibilities, skills, and qualifications for a useful comparison.`} value={jobDescription} onChange={(event) => setJobDescription(event.target.value.slice(0, 12000))} /><Button size="large" variant="contained" startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <FindInPageRounded />} disabled={loading || jobDescription.trim().length < 40} onClick={findMatches}>{loading ? "Comparing resumes…" : "Find best resume"}</Button></Stack></Paper>
        {result && <Box aria-live="polite"><Alert severity="info" sx={{ mb: 2 }}>{result.methodology}</Alert><Stack spacing={2}>{result.matches.map((match, index) => <Card key={match.resumeId} variant="outlined" sx={{ borderColor: index === 0 ? "success.main" : "divider", borderWidth: index === 0 ? 2 : 1 }}><CardContent><Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={2}><Box minWidth={0}><Stack direction="row" gap={1} alignItems="center" flexWrap="wrap"><Typography component="h2" variant="h6" fontWeight={800} sx={{ overflowWrap: "anywhere" }}>{match.fileName}</Typography>{index === 0 && <Chip icon={<EmojiEventsRounded />} label="Best match" color="success" />}</Stack><Typography variant="body2" color="text.secondary" mt={.5}>{match.evidence.length} supporting section{match.evidence.length === 1 ? "" : "s"} found</Typography></Box><Box sx={{ minWidth: 150 }}><Typography variant="h5" fontWeight={850} textAlign={{ sm: "right" }}>{match.score}% match</Typography><LinearProgress color={index === 0 ? "success" : "primary"} variant="determinate" value={match.score} sx={{ mt: .75, height: 7, borderRadius: 4 }} /></Box></Stack><Box mt={2}><Typography variant="caption" color="text.secondary" fontWeight={750}>MATCHED KEYWORDS</Typography><Stack direction="row" gap={.75} flexWrap="wrap" mt={.75}>{match.matchedKeywords.length ? match.matchedKeywords.map((keyword) => <Chip size="small" color="success" variant="outlined" key={keyword} label={keyword} />) : <Typography variant="body2" color="text.secondary">No strong keyword matches found.</Typography>}</Stack></Box><Box mt={2}><Typography variant="caption" color="text.secondary" fontWeight={750}>POTENTIAL GAPS</Typography><Stack direction="row" gap={.75} flexWrap="wrap" mt={.75}>{match.missingKeywords.map((keyword) => <Chip size="small" variant="outlined" key={keyword} label={keyword} />)}</Stack></Box>{match.evidence.length > 0 && <Box mt={2}><Typography variant="caption" color="text.secondary" fontWeight={750}>SUPPORTING EVIDENCE</Typography><Box component="ul" sx={{ mt: .75, mb: 0, pl: 2.5 }}>{match.evidence.map((line) => <Typography component="li" variant="body2" key={line} sx={{ mb: .5 }}>{line}</Typography>)}</Box></Box>}<Button sx={{ mt: 2 }} variant={index === 0 ? "contained" : "outlined"} onClick={() => navigate("/practice/resume-review", { state: { resumeId: match.resumeId, role, jobDescription } })}>Run detailed AI review</Button></CardContent></Card>)}</Stack></Box>}
    </Container>;
}
