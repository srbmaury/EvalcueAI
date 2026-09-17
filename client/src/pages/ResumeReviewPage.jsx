import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useLocation } from "react-router-dom";
import api from "../api/axios";
import { useResumes } from "../hooks/useResumes";
import { useResumePdf } from "../hooks/useResumePdf";

import {
    Box,
    Button,
    Checkbox,
    Chip,
    Container,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    Grid,
    LinearProgress,
    FormControlLabel,
    Link,
    MenuItem,
    Paper,
    Stack,
    TextField,
    Typography,
    CircularProgress,
} from "@mui/material";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import DownloadIcon from "@mui/icons-material/Download";
import JobPostImporter from "../components/JobPostImporter";
import { useNotify } from "../context/NotificationContext";
import { resumeFileError } from "../utils/resumeFileValidation";
import { describeError } from "../utils/errorFormatter";

export default function ResumeReviewPage() {
    const location = useLocation();
    const { getResumes, uploadResume, downloadResume } = useResumes();
    const notify = useNotify();
    const [resumes, setResumes] = useState([]);
    const [resumeId, setResumeId] = useState(location.state?.resumeId || "");
    const [uploading, setUploading] = useState(false);
    const [loadingReview, setLoadingReview] = useState(false);
    const [role, setRole] = useState(location.state?.role || "");
    const [jobDescription, setJobDescription] = useState(location.state?.jobDescription || "");
    const [review, setReview] = useState(null);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewResume, setPreviewResume] = useState(null);
    const previewPath = previewResume?._id ? `/resumes/${previewResume._id}/preview` : "";
    const previewBlobUrl = useResumePdf({ resumeOpen: previewOpen, resumePreviewPath: previewPath, resumeFileType: previewResume?.fileType || "" });
    const [uploadConsent, setUploadConsent] = useState(false);

    useEffect(() => {
        const fetchResumes = async () => {
            const res = await getResumes();
            if (Array.isArray(res)) setResumes(res);
        };
        fetchResumes();
    }, [getResumes]);

    const selected = useMemo(() => resumes.find((r) => r._id === resumeId), [resumes, resumeId]);

    // Switching the selected résumé (dropdown, or a fresh upload) must not leave a
    // previous résumé's review visibly attached to the newly-selected one.
    useEffect(() => { setReview(null); }, [resumeId]);

    const handleUpload = async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const validationError = resumeFileError(file);
        if (validationError) {
            notify(validationError, "error");
            e.target.value = "";
            return;
        }
        try {
            setUploading(true);
            const newResume = await uploadResume(file);
            if (newResume) {
                setResumes((prev) => [...prev, newResume]);
                setResumeId(newResume._id);
                notify("Resume uploaded.", "success");
            }
        } catch {
            notify("The resume could not be uploaded. Check the PDF and try again.", "error");
        } finally {
            setUploading(false);
            e.target.value = "";
        }
    };

    // Allow role and jobDescription to be optional
    const isReady = Boolean(resumeId);

    const requestReview = async () => {
        if (!isReady) return;
        setLoadingReview(true);
        setReview(null);
        try {
            const { data } = await api.post(`/resumes/${resumeId}/review`, { role, jobDescription });
            setReview(data);
        } catch (error) {
            const limitReached = error?.response?.data?.code === "PRACTICE_LIMIT_REACHED";
            notify(describeError(error, "The resume review could not be generated. Try again."), limitReached ? "warning" : "error");
        } finally {
            setLoadingReview(false);
        }
    };

    const handlePreviewResume = (r) => {
        if (!r) return;
        if (r.fileType !== "application/pdf") {
            notify("Preview is available for PDF resumes only.", "warning");
            return;
        }
        setPreviewResume(r);
        setPreviewOpen(true);
    };

    const handleDownloadResume = async (resume) => {
        try {
            await downloadResume(resume);
        } catch (error) {
            notify(error?.response?.data?.message || "The resume could not be downloaded.", "error");
        }
    };

    return (
        <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 5 } }}>
        <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 3 }}>
            <Typography component="h1" variant="h4" fontWeight={800}>AI resume review</Typography>
            <Typography color="text.secondary" sx={{ mt: .75, mb: 3 }}>Compare your resume with a target role and get focused, actionable improvements.</Typography>
            <Stack spacing={2}>
                {resumes.length > 0 && (
                    <TextField
                        fullWidth
                        select
                        label="Choose resume"
                        value={resumeId}
                        onChange={(e) => setResumeId(e.target.value)}
                        helperText={!resumeId ? "Upload or select a resume" : ""}
                        required
                    >
                        {resumes.map((r) => (
                            <MenuItem key={r._id} value={r._id}>
                                {r.fileName || "Untitled Resume"} — {new Date(r.createdAt).toLocaleDateString()}
                            </MenuItem>
                        ))}
                    </TextField>
                )}
                {selected && <Paper variant="outlined" sx={{ p: 2, bgcolor: "action.hover" }}>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} justifyContent="space-between" alignItems={{ sm: "center" }}>
                        <Box minWidth={0}>
                            <Typography variant="overline" color="text.secondary" fontWeight={800}>Selected resume</Typography>
                            <Typography fontWeight={800} sx={{ overflowWrap: "anywhere" }}>{selected.fileName || "Untitled resume"}</Typography>
                            <Typography variant="body2" color="text.secondary">Uploaded {new Date(selected.createdAt).toLocaleDateString()}</Typography>
                        </Box>
                        <Stack direction="row" spacing={1} flexWrap="wrap">
                            {selected.fileType === "application/pdf" && <Button size="small" variant="outlined" startIcon={<PictureAsPdfIcon />} onClick={() => handlePreviewResume(selected)}>Preview</Button>}
                            <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={() => handleDownloadResume(selected)}>Download</Button>
                        </Stack>
                    </Stack>
                </Paper>}
                <FormControlLabel
                    sx={{ alignItems: "flex-start", m: 0 }}
                    control={<Checkbox checked={uploadConsent} onChange={(event) => setUploadConsent(event.target.checked)} size="small" />}
                    label={<Typography variant="body2" color="text.secondary">I understand my resume is stored and processed to provide AI feedback. See the <Link component={RouterLink} to="/privacy">privacy notice</Link>.</Typography>}
                />
                <Button fullWidth variant="outlined" component="label" disabled={uploading || !uploadConsent}>
                    {uploading ? "Uploading…" : "Upload resume PDF"}
                    <input type="file" hidden accept="application/pdf,.pdf" onChange={handleUpload} />
                </Button>

                <JobPostImporter onImport={({ jobRole, jobDescription: importedDescription }) => { setRole(jobRole); setJobDescription(importedDescription); }} />
                <TextField fullWidth label="Target role" value={role} onChange={(e) => setRole(e.target.value)} />
                <TextField
                    fullWidth
                    label="Job description"
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    multiline
                    rows={6}
                />
                <Button fullWidth variant="contained" disabled={!isReady || loadingReview} onClick={requestReview}>
                    {loadingReview ? "Analyzing…" : "Generate AI review"}
                </Button>
                {loadingReview && <LinearProgress />}
            </Stack>

            {!review ? (
                <Box sx={{ p: 2, color: "text.secondary" }}>
                    <Typography variant="subtitle1">Your AI review will appear here</Typography>
                    {selected && selected.fileType === "application/pdf" && (
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                            <PictureAsPdfIcon fontSize="small" />
                            <Typography variant="body2">Selected: {selected.fileName}</Typography>
                        </Stack>
                    )}
                </Box>
            ) : (
                <Box sx={{ p: 2 }}>
                    <Typography variant="h6" gutterBottom>
                        Summary & ATS fit: {review.atsScore}%
                    </Typography>
                    <Typography sx={{ whiteSpace: "pre-wrap" }}>{review.summary}</Typography>
                    <Divider sx={{ my: 2 }} />
                    <Grid container spacing={2}>
                        <Grid item xs={12} md={6}>
                            <Typography variant="subtitle1">Strengths</Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap">
                                {(review.strengths || []).map((s, i) => (
                                    <Chip key={i} label={s} color="success" variant="outlined" sx={{ mr: 1, mb: 1 }} />
                                ))}
                            </Stack>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <Typography variant="subtitle1">Gaps</Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap">
                                {(review.gaps || []).map((s, i) => (
                                    <Chip key={i} label={s} color="warning" variant="outlined" sx={{ mr: 1, mb: 1 }} />
                                ))}
                            </Stack>
                        </Grid>
                        <Grid item xs={12}>
                            <Typography variant="subtitle1">Matched Keywords</Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap">
                                {(review.keywordsMatched || []).map((s, i) => (
                                    <Chip key={i} label={s} variant="outlined" sx={{ mr: 1, mb: 1 }} />
                                ))}
                            </Stack>
                        </Grid>
                        <Grid item xs={12}>
                            <Typography variant="subtitle1">Improvement Suggestions</Typography>
                            <Stack spacing={1}>
                                {(review.improvementSuggestions || []).map((s, i) => (
                                    <Typography key={i}>• {s}</Typography>
                                ))}
                            </Stack>
                        </Grid>
                        {review.roleAlignment ? (
                            <Grid item xs={12}>
                                <Typography variant="subtitle1">Role Alignment</Typography>
                                <Typography sx={{ whiteSpace: "pre-wrap" }}>{review.roleAlignment}</Typography>
                            </Grid>
                        ) : null}
                    </Grid>
                </Box>
            )}

            <Dialog
                open={previewOpen}
                onClose={() => setPreviewOpen(false)}
                fullWidth
                maxWidth="xl"
                PaperProps={{ sx: { height: "92vh" } }}
                aria-labelledby="resume-preview-title"
            >
                <DialogTitle id="resume-preview-title">Preview</DialogTitle>
                <DialogContent dividers sx={{ p: 0, height: "100%" }}>
                    {previewBlobUrl ? (
                        <iframe
                            src={previewBlobUrl}
                            title="Resume Preview"
                            width="100%"
                            height="100%"
                            style={{ border: 0 }}
                        />
                    ) : <Stack height="100%" alignItems="center" justifyContent="center"><CircularProgress /></Stack>}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPreviewOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>
        </Paper>
        </Container>
    );
}
