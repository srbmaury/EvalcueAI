import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Box, Button, CircularProgress, Container, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { AutoAwesomeRounded } from "@mui/icons-material";
import api from "../api/axios";
import JobPostImporter from "../components/JobPostImporter";
import { useNotify } from "../context/NotificationContext";
import { trackEvent } from "../utils/analytics";
import { describeError } from "../utils/errorFormatter";

// The generate endpoint returns a binary PDF (not JSON), so error responses come back
// as a Blob too when the request was made with responseType: "blob" — read it back to
// text/JSON before handing it to describeError, otherwise the error message is lost.
const describeGenerationError = async (error, fallback) => {
    const data = error?.response?.data;
    if (data instanceof Blob) {
        try {
            const parsed = JSON.parse(await data.text());
            error = { ...error, response: { ...error.response, data: parsed } };
        } catch { /* not JSON; fall through to generic handling */ }
    }
    return describeError(error, fallback);
};

export default function ResumeGeneratorPage() {
    const navigate = useNavigate();
    const notify = useNotify();
    const [resumes, setResumes] = useState([]);
    const [resumeId, setResumeId] = useState("");
    const [role, setRole] = useState("");
    const [jobDescription, setJobDescription] = useState("");
    const [loading, setLoading] = useState(false);
    const [pageCount, setPageCount] = useState(null);

    useEffect(() => {
        api.get("/resumes", { params: { limit: 50 } })
            .then(({ data }) => {
                setResumes(data.items || []);
                if (data.items?.length === 1) setResumeId(data.items[0]._id);
            })
            .catch(() => {});
    }, []);

    const generate = async () => {
        if (!resumeId) { notify("Choose a resume to base the tailored version on.", "warning"); return; }
        if (jobDescription.trim().length < 40) { notify("Add a more complete job description before generating.", "warning"); return; }
        setLoading(true); setPageCount(null);
        try {
            const response = await api.post(
                `/resumes/${resumeId}/generate`,
                { role: role.trim(), jobDescription: jobDescription.trim() },
                { responseType: "blob" },
            );
            const fitsOnePage = response.headers["x-resume-page-count"] === "1";
            setPageCount(Number(response.headers["x-resume-page-count"]) || null);
            const url = URL.createObjectURL(response.data);
            const link = document.createElement("a");
            link.href = url;
            link.download = "tailored-resume.pdf";
            link.click();
            URL.revokeObjectURL(url);
            trackEvent("resume_generation_completed");
            notify(fitsOnePage ? "Tailored resume downloaded — it fits on one page." : "Tailored resume downloaded, but it didn’t quite fit one page. Review before sending.", fitsOnePage ? "success" : "warning");
        } catch (error) {
            notify(await describeGenerationError(error, "The tailored resume could not be generated."), "error");
        } finally { setLoading(false); }
    };

    return <Container maxWidth="md" sx={{ py: { xs: 3, md: 6 } }}>
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={2} mb={3}>
            <Box>
                <Typography variant="overline" color="primary.main" fontWeight={800}>Resume intelligence</Typography>
                <Typography component="h1" variant="h3" sx={{ fontSize: { xs: "2.35rem", md: "3rem" } }} fontWeight={850}>Generate a tailored, one-page resume</Typography>
                <Typography color="text.secondary" mt={1}>Pick a saved resume and a target job. We rewrite and trim your content to fit a clean, ATS-friendly one-page layout.</Typography>
            </Box>
            <Button variant="outlined" onClick={() => navigate("/practice/resumes")}>Manage resumes</Button>
        </Stack>
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
            <Stack spacing={2}>
                {resumes.length === 0
                    ? <Alert severity="info">Upload a resume in your library first — the generator rewrites and tailors an existing resume, it doesn’t start from a blank page.</Alert>
                    : <TextField select required label="Base resume" value={resumeId} onChange={(event) => setResumeId(event.target.value)}>
                        {resumes.map((resume) => <MenuItem key={resume._id} value={resume._id}>{resume.fileName || "Untitled resume"}</MenuItem>)}
                    </TextField>}
                <JobPostImporter onImport={({ jobRole, jobDescription: description }) => { setRole(jobRole); setJobDescription(description); }} />
                <TextField label="Target role (optional)" value={role} onChange={(event) => setRole(event.target.value)} />
                <TextField required multiline minRows={7} label="Job description" helperText={`${jobDescription.length}/12000 · Include responsibilities, skills, and qualifications so the tailoring is accurate.`} value={jobDescription} onChange={(event) => setJobDescription(event.target.value.slice(0, 12000))} />
                <Button size="large" variant="contained" startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <AutoAwesomeRounded />} disabled={loading || !resumes.length || jobDescription.trim().length < 40} onClick={generate}>{loading ? "Generating — this can take a moment…" : "Generate tailored resume"}</Button>
                {pageCount !== null && pageCount > 1 && <Alert severity="warning">This came out to {pageCount} pages. Try a shorter job description or a more focused base resume, then regenerate.</Alert>}
            </Stack>
        </Paper>
    </Container>;
}
