import { useEffect, useState } from "react";

// API / Context
import { useResumes } from "../hooks/useResumes";
import { useResumePdf } from "../hooks/useResumePdf";

// Utilities
import { describeError } from "../utils/errorFormatter";

// UI Components
import {
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    FormHelperText,
    IconButton,
    MenuItem,
    Paper,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { useNotify } from "../context/NotificationContext";

// Icons
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/Download";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";

/**
 * ResumeReview
 * Reusable component to upload, select, and preview resumes.
 * Cloned from the upload and preview portion of CreateInterviewPage.
 *
 * Optional props:
 * - value: string (selected resumeId)
 * - onChange: function(resumeId: string)
 * - title: string (heading text)
 */
const ResumeReview = ({ value, onChange, title = "Resume Review" }) => {
    const { getResumes, deleteResume, uploadResume, downloadResume } = useResumes();
    const notify = useNotify();

    const [resumes, setResumes] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [selectedResumeId, setSelectedResumeId] = useState(value || "");

    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewResume, setPreviewResume] = useState(null);
    const previewPath = previewResume?._id ? `/resumes/${previewResume._id}/preview` : "";
    const previewBlobUrl = useResumePdf({ resumeOpen: previewOpen, resumePreviewPath: previewPath, resumeFileType: previewResume?.fileType || "" });

    useEffect(() => {
        const fetchResumes = async () => {
            const res = await getResumes();
            if (res) setResumes(res);
        };
        fetchResumes();
    }, [getResumes]);

    useEffect(() => {
        if (typeof value === "string") {
            setSelectedResumeId(value);
        }
    }, [value]);

    const handleLocalChange = (newId) => {
        setSelectedResumeId(newId);
        if (onChange) onChange(newId);
    };

    const handleUpload = async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        try {
            setUploading(true);
            const newResume = await uploadResume(file);
            if (newResume) {
                setResumes((prev) => [...prev, newResume]);
                handleLocalChange(newResume._id);
                notify("Resume uploaded.", "success");
            }
        } catch (err) {
            console.error("Upload failed", err);
            notify("Resume upload failed.", "error");
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (id) => {
        const ok = await deleteResume(id);
        if (ok) {
            setResumes((prev) => prev.filter((r) => r._id !== id));
            if (selectedResumeId === id) {
                handleLocalChange("");
            }
            notify("Resume removed.", "success");
        } else {
            notify("Resume could not be removed.", "error");
        }
    };

    const handleDownload = async (resume) => {
        try {
            await downloadResume(resume);
        } catch (error) {
            notify(describeError(error, "Resume download failed."), "error");
        }
    };

    const handlePreviewResume = (r) => {
        if (!r) return;
        if (r.fileType !== "application/pdf") {
            notify("Preview is available for PDF files only.", "warning");
            return;
        }
        setPreviewResume(r);
        setPreviewOpen(true);
    };

    const selectedResume = resumes.find((r) => r._id === selectedResumeId);

    return (
        <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
                {title}
            </Typography>

            <Stack spacing={2}>
                <FormControl required error={!selectedResumeId}>
                    <Typography variant="subtitle1">Select Resume</Typography>

                    {/* Upload New Resume */}
                    <Box sx={{ my: 1 }}>
                        <Button variant="outlined" component="label" disabled={uploading}>
                            {uploading ? "Uploading..." : "Upload Resume (PDF)"}
                            <input type="file" hidden accept="application/pdf" onChange={handleUpload} />
                        </Button>
                    </Box>

                    {/* Or Choose Existing */}
                    {resumes.length > 0 && (
                        <TextField
                            select
                            label="Choose from existing resumes"
                            value={selectedResumeId}
                            onChange={(e) => handleLocalChange(e.target.value)}
                            required
                            helperText={selectedResumeId ? "✓ Resume selected" : "Select a resume or upload a new one"}
                            error={!selectedResumeId}
                        >
                            {resumes.map((r) => (
                                <MenuItem key={r._id} value={r._id}>
                                    {r.fileName || "Untitled Resume"} — {new Date(r.createdAt).toLocaleDateString()}
                                    <IconButton
                                        color="primary"
                                        size="small"
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDownload(r);
                                        }}
                                    >
                                        <DownloadIcon />
                                    </IconButton>
                                    <IconButton
                                        color="secondary"
                                        size="small"
                                        sx={{ ml: 1 }}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handlePreviewResume(r);
                                        }}
                                    >
                                        <PictureAsPdfIcon fontSize="small" />
                                    </IconButton>
                                    <IconButton
                                        size="small"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDelete(r._id);
                                        }}
                                        sx={{ ml: 1 }}
                                    >
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                </MenuItem>
                            ))}
                        </TextField>
                    )}

                    {!selectedResumeId && (
                        <FormHelperText>Please select or upload a resume</FormHelperText>
                    )}
                </FormControl>

                {/* Quick inline preview trigger when something is selected */}
                {selectedResume && (
                    <Box>
                        <Button
                            variant="contained"
                            startIcon={<PictureAsPdfIcon />}
                            onClick={() => handlePreviewResume(selectedResume)}
                        >
                            Preview Selected Resume
                        </Button>
                    </Box>
                )}
            </Stack>

            {/* PDF preview dialog */}
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
    );
};

export default ResumeReview;
