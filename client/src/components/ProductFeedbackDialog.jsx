import { useEffect, useRef, useState } from "react";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Stack, TextField, Typography } from "@mui/material";
import AddPhotoAlternateRounded from "@mui/icons-material/AddPhotoAlternateRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import api from "../api/axios";
import { useNotify } from "../context/NotificationContext";
import { feedbackPhotosError, MAX_FEEDBACK_PHOTOS } from "../utils/feedbackPhotoValidation";

export default function ProductFeedbackDialog({ open, onClose }) {
    const [category, setCategory] = useState("idea");
    const [message, setMessage] = useState("");
    const [photos, setPhotos] = useState([]);
    const [saving, setSaving] = useState(false);
    const notify = useNotify();
    const fileInputRef = useRef(null);

    useEffect(() => () => { photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl)); }, [photos]);

    const close = () => { if (!saving) onClose(); };

    const addPhotos = (event) => {
        const files = Array.from(event.target.files || []);
        event.target.value = "";
        if (!files.length) return;
        const error = feedbackPhotosError(photos.length, files);
        if (error) { notify(error, "error"); return; }
        setPhotos((current) => [...current, ...files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))]);
    };

    const removePhoto = (index) => {
        setPhotos((current) => {
            URL.revokeObjectURL(current[index].previewUrl);
            return current.filter((_, i) => i !== index);
        });
    };

    const submit = async () => {
        try {
            setSaving(true);
            const form = new FormData();
            form.append("category", category);
            form.append("message", message.trim());
            form.append("page", window.location.pathname);
            photos.forEach((photo) => form.append("photos", photo.file));
            await api.post("/product-feedback", form, { headers: { "Content-Type": "multipart/form-data" } });
            photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
            setMessage(""); setCategory("idea"); setPhotos([]);
            notify("Thanks — your feedback was sent.", "success");
            onClose();
        } catch (error) {
            notify(error?.response?.data?.message || "Feedback could not be sent.", "error");
        } finally { setSaving(false); }
    };

    return <Dialog open={open} onClose={close} fullWidth maxWidth="sm" aria-labelledby="product-feedback-title">
        <DialogTitle id="product-feedback-title">Share product feedback</DialogTitle>
        <DialogContent><Stack spacing={2} mt={1}>
            <TextField select label="Feedback type" value={category} onChange={(e) => setCategory(e.target.value)}>
                <MenuItem value="idea">Idea or request</MenuItem><MenuItem value="problem">Problem</MenuItem><MenuItem value="praise">What works well</MenuItem><MenuItem value="other">Other</MenuItem>
            </TextField>
            <TextField label="Your feedback" value={message} onChange={(e) => setMessage(e.target.value)} multiline minRows={4} inputProps={{ maxLength: 2000 }} helperText={`${message.length}/2000 · Don’t include passwords or sensitive personal information.`} autoFocus />
            <Box>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={addPhotos} />
                <Button size="small" startIcon={<AddPhotoAlternateRounded />} disabled={photos.length >= MAX_FEEDBACK_PHOTOS} onClick={() => fileInputRef.current?.click()}>Attach photos</Button>
                <Typography variant="caption" color="text.secondary" ml={1}>{photos.length}/{MAX_FEEDBACK_PHOTOS}</Typography>
                {!!photos.length && <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mt={1.5}>
                    {photos.map((photo, index) => <Box key={photo.previewUrl} sx={{ position: "relative", width: 72, height: 72 }}>
                        <Box component="img" src={photo.previewUrl} alt={`Attachment ${index + 1}`} sx={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 1, border: "1px solid", borderColor: "divider" }} />
                        <IconButton aria-label={`Remove attachment ${index + 1}`} size="small" onClick={() => removePhoto(index)} sx={{ position: "absolute", top: -8, right: -8, bgcolor: "background.paper", boxShadow: 1, "&:hover": { bgcolor: "background.paper" } }}><CloseRounded fontSize="inherit" /></IconButton>
                    </Box>)}
                </Stack>}
            </Box>
        </Stack></DialogContent>
        <DialogActions><Button onClick={close}>Close</Button><Button variant="contained" onClick={submit} disabled={saving || message.trim().length < 3}>{saving ? "Sending…" : "Send feedback"}</Button></DialogActions>
    </Dialog>;
}
