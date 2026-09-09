import { useDeferredValue, useEffect, useRef, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Checkbox,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    IconButton,
    Link,
    MenuItem,
    Pagination,
    Select,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import {
    Add as AddIcon,
    DeleteOutline as DeleteIcon,
    DescriptionOutlined as ResumeIcon,
    DownloadOutlined as DownloadIcon,
    EditOutlined as EditIcon,
    PictureAsPdfOutlined as PreviewIcon,
} from "@mui/icons-material";
import { useResumes } from "../hooks/useResumes";
import { useResumePdf } from "../hooks/useResumePdf";
import { useNotify } from "../context/NotificationContext";
import { resumeFileError } from "../utils/resumeFileValidation";

const PAGE_SIZE = 6;

const ResumesPage = () => {
    const { getResumes, uploadResume, updateResume, deleteResume } = useResumes();
    const fileInputRef = useRef(null);
    const [resumes, setResumes] = useState([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [sort, setSort] = useState("-createdAt");
    const [tag, setTag] = useState("");
    const [query, setQuery] = useState("");
    const deferredQuery = useDeferredValue(query.trim());
    const deferredTag = useDeferredValue(tag.trim());
    const [refresh, setRefresh] = useState(0);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [uploadConsent, setUploadConsent] = useState(false);
    const notify = useNotify();
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [editTarget, setEditTarget] = useState(null);
    const [editName, setEditName] = useState("");
    const [editTags, setEditTags] = useState("");
    const [editNotes, setEditNotes] = useState("");
    const [saving, setSaving] = useState(false);
    const [preview, setPreview] = useState(null);
    const previewPath = preview?._id ? `/resumes/${preview._id}/preview` : "";
    const previewBlobUrl = useResumePdf({ resumeOpen: Boolean(preview), resumePreviewPath: previewPath, resumeFileType: preview?.fileType || "" });

    useEffect(() => {
        let active = true;
        const load = async () => {
            setLoading(true);
            try {
                const data = await getResumes({
                    sort,
                    tag: deferredTag || undefined,
                    q: deferredQuery || undefined,
                    page,
                    limit: PAGE_SIZE,
                    paginated: true,
                });
                if (!active) return;
                setResumes(data.items);
                setTotalPages(Math.max(data.totalPages || 1, 1));
            } catch (error) {
                if (!active) return;
                setResumes([]);
                notify(error?.response?.data?.message || "Could not load resumes.", "error");
            } finally {
                if (active) setLoading(false);
            }
        };
        load();
        return () => { active = false; };
    }, [deferredQuery, deferredTag, getResumes, notify, page, refresh, sort]);

    useEffect(() => { setPage(1); }, [deferredQuery, deferredTag, sort]);

    const handleFileChange = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const validationError = resumeFileError(file);
        if (validationError) {
            notify(validationError, "error");
            event.target.value = "";
            return;
        }
        try {
            setUploading(true);
            await uploadResume(file);
            setPage(1);
            setRefresh((value) => value + 1);
            notify("Resume uploaded.", "success");
        } catch (error) {
            notify(error?.response?.data?.message || "Resume upload failed.", "error");
        } finally {
            setUploading(false);
            event.target.value = "";
        }
    };

    const openEdit = (resume) => {
        setEditTarget(resume);
        setEditName(resume.fileName || "");
        setEditTags((resume.tags || []).join(", "));
        setEditNotes(resume.notes || "");
    };

    const saveEdit = async () => {
        try {
            setSaving(true);
            const updated = await updateResume(editTarget._id, {
                fileName: editName.trim(),
                tags: [...new Set(editTags.split(",").map((value) => value.trim()).filter(Boolean))],
                notes: editNotes.trim(),
            });
            setResumes((items) => items.map((item) => item._id === updated._id ? updated : item));
            setEditTarget(null);
            notify("Resume details updated.", "success");
        } catch (error) {
            notify(error?.response?.data?.message || "Could not update the resume.", "error");
        } finally {
            setSaving(false);
        }
    };

    const confirmDelete = async () => {
        try {
            setDeleting(true);
            await deleteResume(deleteTarget._id);
            const wasOnlyItem = resumes.length === 1;
            setDeleteTarget(null);
            if (wasOnlyItem && page > 1) setPage((value) => value - 1);
            else setRefresh((value) => value + 1);
            notify("Resume deleted.", "success");
        } catch (error) {
            notify(error?.response?.data?.message || "Could not delete the resume.", "error");
        } finally {
            setDeleting(false);
        }
    };

    return (
        <Box component="section" aria-labelledby="resumes-heading" sx={{ maxWidth: 1200, mx: "auto", px: { xs: 2, sm: 3 }, py: { xs: 3, md: 5 } }}>
            <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={2} mb={3}>
                <Box>
                    <Typography id="resumes-heading" component="h1" variant="h4" fontWeight={800}>Resumes</Typography>
                    <Typography color="text.secondary" mt={0.75}>Keep your resume versions organized and ready for tailored practice.</Typography>
                </Box>
                <Stack alignItems={{ xs: "stretch", md: "flex-end" }} spacing={1}>
                    <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" hidden onChange={handleFileChange} />
                    <FormControlLabel
                        sx={{ maxWidth: 440, alignItems: "flex-start", m: 0 }}
                        control={<Checkbox size="small" checked={uploadConsent} onChange={(event) => setUploadConsent(event.target.checked)} />}
                        label={<Typography variant="caption" color="text.secondary">I agree that this resume may be stored and processed for AI feedback. See the <Link component={RouterLink} to="/privacy">privacy notice</Link>.</Typography>}
                    />
                    <Button variant="contained" startIcon={uploading ? <CircularProgress size={18} color="inherit" /> : <AddIcon />} disabled={!uploadConsent || uploading} onClick={() => fileInputRef.current?.click()}>
                        {uploading ? "Uploading…" : "Upload PDF"}
                    </Button>
                    <Button component={RouterLink} to="/practice/resume-match" variant="outlined">Find best resume for a job</Button>
                </Stack>
            </Stack>


            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} mb={3}>
                <TextField fullWidth size="small" label="Search resumes" value={query} onChange={(event) => setQuery(event.target.value)} />
                <TextField fullWidth size="small" label="Filter by tag" value={tag} onChange={(event) => setTag(event.target.value)} />
                <Select size="small" value={sort} onChange={(event) => setSort(event.target.value)} inputProps={{ "aria-label": "Sort resumes" }} sx={{ minWidth: { sm: 150 } }}>
                    <MenuItem value="-createdAt">Newest</MenuItem>
                    <MenuItem value="createdAt">Oldest</MenuItem>
                    <MenuItem value="fileName">Name A–Z</MenuItem>
                    <MenuItem value="-fileName">Name Z–A</MenuItem>
                </Select>
            </Stack>

            {loading ? (
                <Stack alignItems="center" py={8}><CircularProgress aria-label="Loading resumes" /></Stack>
            ) : resumes.length === 0 ? (
                <Card variant="outlined"><CardContent sx={{ py: 7, textAlign: "center" }}><ResumeIcon color="primary" sx={{ fontSize: 48 }} /><Typography component="h2" variant="h6" mt={1}>No resumes found</Typography><Typography color="text.secondary" mt={0.5}>{query || tag ? "Try changing your search or tag filter." : "Upload a PDF to create your resume library."}</Typography></CardContent></Card>
            ) : (
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" }, gap: 2 }}>
                    {resumes.map((resume) => (
                        <Card key={resume._id} variant="outlined" sx={{ minWidth: 0 }}>
                            <CardContent sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
                                <ResumeIcon color="primary" fontSize="large" />
                                <Typography component="h2" variant="h6" fontWeight={700} mt={1} title={resume.fileName || "Untitled resume"}>{resume.fileName || "Untitled resume"}</Typography>
                                <Typography variant="body2" color="text.secondary">Uploaded {new Date(resume.createdAt).toLocaleDateString()}</Typography>
                                {resume.tags?.length > 0 && <Stack direction="row" gap={0.75} useFlexGap flexWrap="wrap" mt={1.5}>{resume.tags.map((value) => <Chip key={value} label={value} size="small" />)}</Stack>}
                                {resume.notes && <Typography variant="body2" color="text.secondary" mt={1.5} sx={{ overflowWrap: "anywhere" }}>{resume.notes}</Typography>}
                                <Stack direction="row" spacing={0.5} mt="auto" pt={2}>
                                    <Tooltip title="Download"><IconButton component="a" href={resume.fileUrl} download aria-label={`Download ${resume.fileName || "resume"}`}><DownloadIcon /></IconButton></Tooltip>
                                    <Tooltip title="Preview PDF"><span><IconButton disabled={resume.fileType !== "application/pdf"} onClick={() => setPreview(resume)} aria-label={`Preview ${resume.fileName || "resume"}`}><PreviewIcon /></IconButton></span></Tooltip>
                                    <Tooltip title="Edit details"><IconButton onClick={() => openEdit(resume)} aria-label={`Edit ${resume.fileName || "resume"}`}><EditIcon /></IconButton></Tooltip>
                                    <Tooltip title="Delete"><IconButton color="error" onClick={() => setDeleteTarget(resume)} aria-label={`Delete ${resume.fileName || "resume"}`}><DeleteIcon /></IconButton></Tooltip>
                                </Stack>
                            </CardContent>
                        </Card>
                    ))}
                </Box>
            )}

            {totalPages > 1 && <Stack alignItems="center" mt={4}><Pagination page={page} count={totalPages} onChange={(_, value) => setPage(value)} color="primary" aria-label="Resume pages" /></Stack>}

            <Dialog open={Boolean(editTarget)} onClose={() => !saving && setEditTarget(null)} fullWidth maxWidth="sm" aria-labelledby="edit-resume-title">
                <DialogTitle id="edit-resume-title">Edit resume details</DialogTitle>
                <DialogContent dividers><Stack spacing={2} mt={1}><TextField autoFocus required label="File name" value={editName} onChange={(event) => setEditName(event.target.value)} /><TextField label="Tags (comma separated)" value={editTags} onChange={(event) => setEditTags(event.target.value)} /><TextField multiline minRows={3} label="Notes" value={editNotes} onChange={(event) => setEditNotes(event.target.value)} /></Stack></DialogContent>
                <DialogActions><Button disabled={saving} onClick={() => setEditTarget(null)}>Cancel</Button><Button variant="contained" disabled={saving || !editName.trim()} onClick={saveEdit}>{saving ? "Saving…" : "Save"}</Button></DialogActions>
            </Dialog>

            <Dialog open={Boolean(deleteTarget)} onClose={() => !deleting && setDeleteTarget(null)} aria-labelledby="delete-resume-title">
                <DialogTitle id="delete-resume-title">Delete resume permanently?</DialogTitle>
                <DialogContent><Alert severity="warning" sx={{ mb: 2 }}>This action cannot be undone.</Alert><Typography>“{deleteTarget?.fileName || "Untitled resume"}” will be removed from your account and may no longer be available to related interviews.</Typography></DialogContent>
                <DialogActions><Button disabled={deleting} onClick={() => setDeleteTarget(null)}>Cancel</Button><Button color="error" variant="contained" disabled={deleting} onClick={confirmDelete}>{deleting ? "Deleting…" : "Delete permanently"}</Button></DialogActions>
            </Dialog>

            <Dialog open={Boolean(preview)} onClose={() => setPreview(null)} fullWidth maxWidth="xl" PaperProps={{ sx: { height: "92vh" } }} aria-labelledby="resume-preview-title">
                <DialogTitle id="resume-preview-title">{preview?.fileName || "Resume preview"}</DialogTitle>
                <DialogContent dividers sx={{ p: 0 }}>
                    {previewBlobUrl ? <iframe src={previewBlobUrl} title={`Preview of ${preview?.fileName || "resume"}`} width="100%" height="100%" style={{ border: 0 }} /> : <Stack height="100%" alignItems="center" justifyContent="center"><CircularProgress /></Stack>}
                </DialogContent>
                <DialogActions><Button onClick={() => setPreview(null)}>Close</Button></DialogActions>
            </Dialog>
        </Box>
    );
};

export default ResumesPage;
