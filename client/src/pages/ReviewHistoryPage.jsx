import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Checkbox,
    Chip,
    CircularProgress,
    Collapse,
    Container,
    Divider,
    Pagination,
    Paper,
    Stack,
    Typography,
} from "@mui/material";
import { CompareArrows, DeleteOutline } from "@mui/icons-material";
import api from "../api/axios";
import { useNotify } from "../context/NotificationContext";

const PAGE_SIZE = 6;

const ReviewSection = ({ title, items }) => (Array.isArray(items) && items.length > 0 ? (
    <Box>
        <Typography component="h3" variant="subtitle2" fontWeight={750} gutterBottom>{title}</Typography>
        <Stack component="ul" spacing={0.5} sx={{ my: 0, pl: 2.5 }}>
            {items.map((item, index) => <Typography component="li" variant="body2" key={index}>{item}</Typography>)}
        </Stack>
    </Box>
) : null);

const normalizedSet = (values) => new Set((Array.isArray(values) ? values : []).map((value) => String(value).trim().toLocaleLowerCase()).filter(Boolean));

const onlyIn = (values, otherValues) => {
    const other = normalizedSet(otherValues);
    return (Array.isArray(values) ? values : []).filter((value) => !other.has(String(value).trim().toLocaleLowerCase()));
};

const DifferenceList = ({ title, added, removed, emptyText }) => (
    <Box>
        <Typography component="h3" variant="subtitle1" fontWeight={750} gutterBottom>{title}</Typography>
        <Stack direction="row" useFlexGap flexWrap="wrap" gap={1}>
            {added.map((value) => <Chip key={`added-${value}`} label={`+ ${value}`} color="success" variant="outlined" />)}
            {removed.map((value) => <Chip key={`removed-${value}`} label={`− ${value}`} color="warning" variant="outlined" />)}
            {!added.length && !removed.length && <Typography variant="body2" color="text.secondary">{emptyText}</Typography>}
        </Stack>
    </Box>
);

export default function ReviewHistoryPage() {
    const [reviews, setReviews] = useState([]);
    const [selected, setSelected] = useState([]);
    const [expandedId, setExpandedId] = useState(null);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState("");
    const [error, setError] = useState("");
    const [refresh, setRefresh] = useState(0);
    const notify = useNotify();

    const loadReviews = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const { data } = await api.get("/resumes/reviews", { params: { page, limit: PAGE_SIZE } });
            setReviews(Array.isArray(data?.items) ? data.items : []);
            setTotalPages(Math.max(Number(data?.totalPages) || 1, 1));
        } catch {
            setReviews([]);
            setError("We couldn’t load your saved reviews. Try again.");
        } finally {
            setLoading(false);
        }
    }, [page]);

    useEffect(() => { loadReviews(); }, [loadReviews, refresh]);

    const toggleSelected = (review) => {
        setSelected((current) => {
            if (current.some((item) => item._id === review._id)) return current.filter((item) => item._id !== review._id);
            if (current.length === 2) return current;
            return [...current, review];
        });
    };

    const removeReview = async (review) => {
        setDeletingId(review._id);
        setError("");
        try {
            await api.delete(`/resumes/reviews/${review._id}`);
            setSelected((current) => current.filter((item) => item._id !== review._id));
            if (reviews.length === 1 && page > 1) setPage((current) => current - 1);
            else setRefresh((current) => current + 1);
            notify("Resume review removed.", "success");
        } catch {
            notify("That review couldn’t be removed. Try again.", "error");
        } finally {
            setDeletingId("");
        }
    };

    const comparison = useMemo(() => {
        if (selected.length !== 2) return null;
        const [earlier, later] = [...selected].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        return {
            earlier,
            later,
            delta: Number(later.atsScore || 0) - Number(earlier.atsScore || 0),
            strengthsAdded: onlyIn(later.strengths, earlier.strengths),
            strengthsRemoved: onlyIn(earlier.strengths, later.strengths),
            gapsAdded: onlyIn(later.gaps, earlier.gaps),
            gapsResolved: onlyIn(earlier.gaps, later.gaps),
            keywordsAdded: onlyIn(later.keywordsMatched, earlier.keywordsMatched),
            keywordsRemoved: onlyIn(earlier.keywordsMatched, later.keywordsMatched),
        };
    }, [selected]);

    return (
        <Container maxWidth="lg" sx={{ py: { xs: 3, md: 6 } }}>
            <Box sx={{ mb: 3 }}>
                <Typography component="h1" variant="h3" fontWeight={850}>Resume review history</Typography>
                <Typography color="text.secondary" sx={{ mt: 1 }}>Revisit saved feedback or select two reviews to see what changed.</Typography>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" onClick={loadReviews}>Retry</Button>}>{error}</Alert>}
            <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, mb: 3 }}>
                <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} spacing={1}>
                    <Box>
                        <Typography component="h2" variant="h6" fontWeight={750}>Compare reviews</Typography>
                        <Typography variant="body2" color="text.secondary" aria-live="polite">{selected.length} of 2 selected</Typography>
                    </Box>
                    {selected.length > 0 && <Button size="small" onClick={() => setSelected([])}>Clear selection</Button>}
                </Stack>

                {comparison && <>
                    <Divider sx={{ my: 2.5 }} />
                    <Stack direction="row" alignItems="center" spacing={1} mb={2}>
                        <CompareArrows color="primary" />
                        <Typography fontWeight={750}>{comparison.earlier.resumeName} to {comparison.later.resumeName}</Typography>
                    </Stack>
                    <Card variant="outlined" sx={{ mb: 2, bgcolor: "action.hover" }}>
                        <CardContent>
                            <Typography variant="body2" color="text.secondary">ATS score change</Typography>
                            <Typography variant="h4" fontWeight={850} color={comparison.delta > 0 ? "success.main" : comparison.delta < 0 ? "warning.main" : "text.primary"}>
                                {comparison.delta > 0 ? "+" : ""}{comparison.delta} points
                            </Typography>
                            <Typography variant="body2">{comparison.earlier.atsScore ?? 0}% → {comparison.later.atsScore ?? 0}%</Typography>
                        </CardContent>
                    </Card>
                    <Stack spacing={2.5}>
                        <DifferenceList title="Strengths" added={comparison.strengthsAdded} removed={comparison.strengthsRemoved} emptyText="The listed strengths are unchanged." />
                        <DifferenceList title="Gaps" added={comparison.gapsAdded} removed={comparison.gapsResolved} emptyText="The listed gaps are unchanged." />
                        <DifferenceList title="Matched keywords" added={comparison.keywordsAdded} removed={comparison.keywordsRemoved} emptyText="The matched keywords are unchanged." />
                    </Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>Green + items appear in the newer review; amber − items only appear in the earlier review (for gaps, they may be resolved).</Typography>
                </>}
            </Paper>

            {loading ? <Stack alignItems="center" py={6}><CircularProgress aria-label="Loading saved reviews" /></Stack> : reviews.length === 0 ? (
                <Alert severity="info">No saved resume reviews yet. Generate a review to start your history.</Alert>
            ) : <Stack spacing={2}>
                {reviews.map((review) => {
                    const checked = selected.some((item) => item._id === review._id);
                    const selectionDisabled = !checked && selected.length === 2;
                    return <Card key={review._id} variant="outlined" sx={{ borderColor: checked ? "primary.main" : undefined }}>
                        <CardContent>
                            <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={2}>
                                <Stack direction="row" spacing={1} alignItems="flex-start">
                                    <Checkbox checked={checked} disabled={selectionDisabled} onChange={() => toggleSelected(review)} inputProps={{ "aria-label": `Compare ${review.resumeName || "resume review"}` }} />
                                    <Box>
                                        <Typography component="h2" variant="h6" fontWeight={750}>{review.role || "General resume review"}</Typography>
                                        <Typography variant="body2" color="text.secondary">{review.resumeName || "Resume"} · {new Date(review.createdAt).toLocaleDateString()}</Typography>
                                    </Box>
                                </Stack>
                                <Stack direction="row" alignItems="center" spacing={1} sx={{ pl: { xs: 5, sm: 0 } }}>
                                    <Chip label={`${review.atsScore ?? 0}% ATS`} color="primary" variant="outlined" />
                                    <Button color="error" size="small" startIcon={deletingId === review._id ? <CircularProgress size={16} color="inherit" /> : <DeleteOutline />} disabled={Boolean(deletingId)} onClick={() => removeReview(review)}>Remove</Button>
                                </Stack>
                            </Stack>
                            {review.summary && <Typography variant="body2" sx={{ mt: 2 }}>{review.summary}</Typography>}
                            <Button size="small" sx={{ mt: 1, px: 0 }} onClick={() => setExpandedId((current) => (current === review._id ? null : review._id))} aria-expanded={expandedId === review._id}>
                                {expandedId === review._id ? "Hide full review" : "Show full review"}
                            </Button>
                            <Collapse in={expandedId === review._id} unmountOnExit>
                                <Stack spacing={2} sx={{ mt: 1 }}>
                                    {review.roleAlignment && <Typography variant="body2" color="text.secondary">{review.roleAlignment}</Typography>}
                                    <ReviewSection title="Strengths" items={review.strengths} />
                                    <ReviewSection title="Gaps" items={review.gaps} />
                                    <ReviewSection title="Suggested improvements" items={review.improvementSuggestions} />
                                    {Array.isArray(review.keywordsMatched) && review.keywordsMatched.length > 0 && (
                                        <Stack direction="row" useFlexGap flexWrap="wrap" gap={1}>
                                            {review.keywordsMatched.map((keyword) => <Chip key={keyword} label={keyword} size="small" variant="outlined" />)}
                                        </Stack>
                                    )}
                                </Stack>
                            </Collapse>
                        </CardContent>
                    </Card>;
                })}
            </Stack>}

            {totalPages > 1 && <Stack alignItems="center" sx={{ mt: 3 }}><Pagination page={page} count={totalPages} onChange={(_, nextPage) => setPage(nextPage)} color="primary" aria-label="Saved review pages" /></Stack>}
        </Container>
    );
}
