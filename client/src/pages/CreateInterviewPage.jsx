import { useContext, useEffect, useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";

import api from "../api/axios";
import { AuthContext } from "../context/AuthContext";
import { useResumes } from "../hooks/useResumes";
import { trackEvent } from "../utils/analytics";

import Alert from "@mui/material/Alert";
import {
    Box,
    Button,
    Checkbox,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControl,
    FormControlLabel,
    FormHelperText,
    IconButton,
    Link,
    MenuItem,
    Paper,
    Stack,
    Step,
    StepLabel,
    Stepper,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";

import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/Download";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";

import RoundSelector from "../components/RoundSelector";
import { getDefaultQuestionLimit } from "../utils/roundDefaults";
import { clearPracticeCreateDraft, readPracticeCreateDraft, writePracticeCreateDraft } from "../utils/practiceCreateDraft";
import { useNotify } from "../context/NotificationContext";
import JobPostImporter from "../components/JobPostImporter";

const INTERVIEW_PRESETS = [
    { name: "Frontend", company: "", jobRole: "Frontend Engineer", jobDescription: "Build accessible, performant web applications with React, JavaScript, testing, API integration, and modern frontend architecture." },
    { name: "Backend", company: "", jobRole: "Backend Engineer", jobDescription: "Design reliable APIs and distributed services with databases, caching, queues, observability, security, testing, and scalable system design." },
    { name: "Full stack", company: "", jobRole: "Full Stack Engineer", jobDescription: "Own product features end to end across React, APIs, data modeling, testing, deployment, performance, security, and cross-functional collaboration." },
];

const CreateInterviewPage = () => {
    const { getResumes, deleteResume, uploadResume } = useResumes();
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();
    const notify = useNotify();
    const [initialDraft] = useState(() => readPracticeCreateDraft());

    const [formData, setFormData] = useState(initialDraft.formData || {
        company: "",
        jobRole: "",
        jobDescription: "",
        resumeId: "",
    });

    useEffect(() => {
        if (!user?.targetRole) return;
        setFormData((current) => current.jobRole ? current : { ...current, jobRole: user.targetRole });
    }, [user?.targetRole]);

    const [resumes, setResumes] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [uploadConsent, setUploadConsent] = useState(false);

    const [suggestedRounds, setSuggestedRounds] = useState(initialDraft.suggestedRounds || []);
    const [grounding, setGrounding] = useState(initialDraft.grounding || null);
    const [selectedRounds, setSelectedRounds] = useState(initialDraft.selectedRounds || []);
    const [loadingRounds, setLoadingRounds] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewUrl, setPreviewUrl] = useState("");
    const [deleteConfirmId, setDeleteConfirmId] = useState(null);
    const [activeStep, setActiveStep] = useState(initialDraft.activeStep || 0);

    useEffect(() => {
        writePracticeCreateDraft({ formData, suggestedRounds, grounding, selectedRounds, activeStep });
    }, [formData, suggestedRounds, grounding, selectedRounds, activeStep]);

    useEffect(() => {
        const fetchResumes = async () => {
            const res = await getResumes();
            if (res) setResumes(res);
        };
        fetchResumes();
    }, [getResumes]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            setUploading(true);
            const newResume = await uploadResume(file);
            if (newResume) {
                trackEvent("resume_uploaded");
                setResumes((prev) => [...prev, newResume]);
                setFormData((prev) => ({ ...prev, resumeId: newResume._id }));
                notify("Resume uploaded.", "success");
            }
        } catch (err) {
            console.error("Upload failed", err);
            notify(err?.response?.data?.message || err?.message || "Resume upload failed.", "error");
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (id) => {
        const ok = await deleteResume(id);
        if (ok) {
            setResumes((prev) => prev.filter((r) => r._id !== id));
            if (formData.resumeId === id) {
                setFormData((prev) => ({ ...prev, resumeId: "" }));
            }
            notify("Resume removed.", "success");
        } else {
            notify("Resume could not be removed.", "error");
        }
    };

    const handlePreviewResume = (r) => {
        if (!r) return;
        if (r.fileType !== "application/pdf") {
            notify("Preview is available for PDF files only.", "warning");
            return;
        }
        setPreviewUrl(`/api/resumes/${r._id}/preview`);
        setPreviewOpen(true);
    };

    const handleSuggestRounds = async () => {
        setLoadingRounds(true);
        setSelectedRounds([]);
        setGrounding(null);
        try {
            const { data } = await api.post(`/rounds/suggest`, {
                company: formData.company,
                jobRole: formData.jobRole,
                jobDescription: formData.jobDescription,
                resumeId: formData.resumeId || undefined,
            });
            const rounds = Array.isArray(data) ? data : (Array.isArray(data?.rounds) ? data.rounds : []);
            setGrounding(Array.isArray(data) ? null : data?.grounding || null);
            setSuggestedRounds(rounds);
            const coreRounds = rounds
                .filter((round) => round.recommended !== false)
                .map((round) => ({
                    ...round,
                    deliveryMode: round.deliveryMode || "conversational",
                    questionLimit: Number(round.questionLimit) || getDefaultQuestionLimit(round),
                }));
            setSelectedRounds(coreRounds.length ? coreRounds : rounds.slice(0, 2).map((round) => ({
                ...round,
                deliveryMode: round.deliveryMode || "conversational",
                questionLimit: Number(round.questionLimit) || getDefaultQuestionLimit(round),
            })));
            if (rounds.length > 0) setActiveStep(1);
            notify(coreRounds.length ? `AI selected ${coreRounds.length} core round${coreRounds.length === 1 ? "" : "s"}; review or adjust them.` : "Interview rounds are ready to review.", "success");
        } catch (error) {
            console.error(error);
            notify("Interview rounds could not be suggested.", "error");
        } finally {
            setLoadingRounds(false);
        }
    };

    const handleToggleRound = (round) => {
        setSelectedRounds((prev) => {
            const exists = prev.some((r) => r.roundName === round.roundName);
            if (exists) {
                return prev.filter((r) => r.roundName !== round.roundName);
            }
            const deliveryMode = round.deliveryMode || "conversational";
            return [...prev, { ...round, deliveryMode, questionLimit: getDefaultQuestionLimit({ ...round, deliveryMode }) }];
        });
    };

    const handleChangeMode = (roundName, mode) => {
        setSelectedRounds((prev) => prev.map((r) => r.roundName === roundName ? { ...r, deliveryMode: mode } : r));
    };

    const handleChangeCount = (roundName, num) => {
        const safe = Math.min(Math.max(Number(num) || 4, 1), 20);
        setSelectedRounds((prev) => prev.map((r) => r.roundName === roundName ? { ...r, questionLimit: safe } : r));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (selectedRounds.length === 0) {
            notify("Select at least one round.", "warning");
            return;
        }

        try {
            const { data } = await api.post(`/interviews`, {
                ...formData,
                rounds: selectedRounds,
            });
            if (data && data._id) {
                clearPracticeCreateDraft();
                trackEvent("interview_created");
                notify("Interview created. Choose a round when you’re ready to begin.", "success");
                navigate(`/practice/interviews/${data._id}`);
            } else {
                notify("Interview could not be created.", "error");
            }
        } catch (error) {
            console.log("error", error);
            if (error?.response?.data?.code !== "PRACTICE_LIMIT_REACHED") {
                notify(error?.response?.data?.message || "Interview could not be created.", "error");
            }
        }
    };

    const isFormValid = formData.jobRole && formData.jobDescription;

    return (
        <Paper elevation={0} variant="outlined" sx={{ p: { xs: 2.5, sm: 4.5 }, maxWidth: 920, mx: "auto", my: { xs: 3, md: 6 }, borderRadius: 4 }}>
            <Typography variant="overline" color="primary.main" fontWeight={850}>New practice session</Typography>
            <Typography component="h1" variant="h4" fontWeight={850} letterSpacing="-.03em" mt={.5}>Build your interview plan</Typography>
            <Typography color="text.secondary" mt={1}>Tell us what you’re preparing for. You’ll review every suggested round, then choose the round you want to start from the interview overview.</Typography>
            <Stepper activeStep={activeStep} sx={{ my: 4 }}>
                <Step><StepLabel>Role and resume</StepLabel></Step>
                <Step><StepLabel>Review interview plan</StepLabel></Step>
            </Stepper>

            <form onSubmit={handleSubmit}>
                <Stack spacing={2}>
                    <Box sx={{ display: activeStep === 0 ? "block" : "none" }}>
                    <Stack spacing={2}>
                    <Typography component="h2" variant="h6" fontWeight={750}>Target role</Typography>
                    <Box>
                        <Typography variant="body2" color="text.secondary" mb={1}>Start quickly with a preset, then tailor every field to the actual job.</Typography>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                            {INTERVIEW_PRESETS.map((preset) => <Button key={preset.name} variant="outlined" startIcon={<AutoAwesomeIcon />} onClick={() => setFormData((current) => ({ ...current, company: preset.company, jobRole: preset.jobRole, jobDescription: preset.jobDescription }))}>{preset.name}</Button>)}
                        </Stack>
                    </Box>
                    <JobPostImporter onImport={({ company, jobRole, jobDescription }) => setFormData((current) => ({ ...current, company: company || current.company, jobRole, jobDescription }))} />
                    <TextField
                        label="Company (optional)"
                        name="company"
                        value={formData.company}
                        onChange={handleChange}
                        placeholder="Leave blank for general role practice"
                        helperText="Adding a company can ground the plan in public role-specific interview information when available."
                    />
                    <TextField
                        label="Job role"
                        name="jobRole"
                        value={formData.jobRole}
                        onChange={handleChange}
                        required
                    />
                    <TextField
                        label="Job description"
                        name="jobDescription"
                        value={formData.jobDescription}
                        multiline
                        rows={4}
                        onChange={handleChange}
                        required
                        helperText="Include responsibilities, seniority, required skills, and success criteria; these directly shape generated questions."
                    />

                    <Divider sx={{ my: 2.5 }} />

                    <FormControl>
                        <Typography component="h2" variant="h6" fontWeight={750}>Resume context</Typography>
                        <Typography variant="body2" color="text.secondary" mb={1}>Optional: add the resume you’ll submit for experience-specific questions, or continue with role-only practice.</Typography>

                        <Box sx={{ my: 1 }}>
                            <Button variant="outlined" component="label" disabled={uploading || !uploadConsent}>
                                {uploading ? "Uploading..." : "Upload Resume (PDF)"}
                                <input type="file" hidden accept="application/pdf" onChange={handleUpload} />
                            </Button>
                            <FormControlLabel
                                sx={{ display: "flex", mt: 1, alignItems: "flex-start" }}
                                control={<Checkbox checked={uploadConsent} onChange={(event) => setUploadConsent(event.target.checked)} size="small" />}
                                label={<Typography variant="caption" color="text.secondary">I understand my resume will be stored and processed by configured service providers to generate interview content. See the <Link component={RouterLink} to="/privacy">privacy notice</Link>.</Typography>}
                            />
                        </Box>

                        {resumes.length > 0 && (
                            <TextField
                                select
                                label="Choose an existing resume"
                                value={formData.resumeId}
                                onChange={(e) => setFormData({ ...formData, resumeId: e.target.value })}
                            >
                                <MenuItem value="">Continue without a resume</MenuItem>
                                {resumes.map((r) => (
                                    <MenuItem key={r._id} value={r._id}>
                                        {r.fileName || "Untitled Resume"} — {new Date(r.createdAt).toLocaleDateString()}
                                    </MenuItem>
                                ))}
                            </TextField>
                        )}
                        {formData.resumeId && (() => {
                            const selectedResume = resumes.find((resume) => resume._id === formData.resumeId);
                            if (!selectedResume) return null;
                            return <Box component="details" sx={{ mt: 1.25 }}>
                                <Typography component="summary" variant="caption" color="text.secondary" fontWeight={700} sx={{ cursor: "pointer" }}>Selected: {selectedResume.fileName || "Untitled resume"} · resume options</Typography>
                                <Stack direction="row" spacing={1} alignItems="center" mt={1}>
                                    <Button size="small" component="a" href={selectedResume.fileUrl} download startIcon={<DownloadIcon fontSize="small" />}>Download</Button>
                                    <Button size="small" onClick={() => handlePreviewResume(selectedResume)} startIcon={<PictureAsPdfIcon fontSize="small" />}>Preview</Button>
                                    <Tooltip title="Remove this saved resume from your account"><IconButton size="small" color="error" onClick={() => setDeleteConfirmId(selectedResume._id)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                                </Stack>
                            </Box>;
                        })()}

                        {!formData.resumeId && <FormHelperText>Questions will use the role and job description without personal resume context.</FormHelperText>}
                    </FormControl>

                    <Divider sx={{ my: 2 }} />

                    <Tooltip title={!isFormValid ? "Fill in the role and job description first" : "AI will suggest interview rounds based on your details"}>
                        <span>
                            <Button variant="outlined" onClick={handleSuggestRounds} disabled={!isFormValid || loadingRounds} fullWidth size="large">
                                {loadingRounds ? <CircularProgress size={20} /> : "Build my interview plan"}
                            </Button>
                        </span>
                    </Tooltip>
                    </Stack>
                    </Box>

                    {activeStep === 1 && <>
                    <Typography component="h2" variant="h6" fontWeight={750}>Choose the rounds you want to practice</Typography>
                    {grounding && (
                        <Alert severity={grounding.status === "grounded" ? "success" : "info"}>
                            {grounding.status === "grounded"
                                ? `Grounded in ${grounding.sourceCount} public company/role experience source${grounding.sourceCount === 1 ? "" : "s"}. Questions will combine this evidence with your JD and resume.`
                                : "Limited public company-specific evidence was found. This plan is clearly treated as an AI simulation based on the JD, role, and resume."}
                        </Alert>
                    )}
                    <RoundSelector
                        suggestedRounds={suggestedRounds}
                        selectedRounds={selectedRounds}
                        onToggleRound={handleToggleRound}
                        onChangeMode={handleChangeMode}
                        onChangeCount={handleChangeCount}
                    />
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                        <Button variant="outlined" onClick={() => setActiveStep(0)}>Back</Button>
                        <Button type="submit" variant="contained" disabled={!isFormValid || selectedRounds.length === 0} sx={{ flex: 1 }}>Create interview</Button>
                    </Stack>
                    </>}
                </Stack>
            </form>

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
                    {previewUrl ? (
                        <iframe
                            src={previewUrl}
                            title="Resume Preview"
                            width="100%"
                            height="100%"
                            style={{ border: 0 }}
                        />
                    ) : null}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPreviewOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>
            <Dialog open={Boolean(deleteConfirmId)} onClose={() => setDeleteConfirmId(null)} aria-labelledby="create-delete-resume-title">
                <DialogTitle id="create-delete-resume-title">Delete this resume?</DialogTitle>
                <DialogContent><Typography>This permanently removes the resume from your account and may affect interviews that use it.</Typography></DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
                    <Button color="error" variant="contained" onClick={async () => { const id = deleteConfirmId; setDeleteConfirmId(null); await handleDelete(id); }}>Delete</Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
};

export default CreateInterviewPage;