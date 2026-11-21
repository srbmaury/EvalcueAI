import { useCallback, useEffect, useState } from "react";
import {
    Alert,
    Box,
    Button,
    Card,
    CardActions,
    CardContent,
    CircularProgress,
    Container,
    Grid,
    Pagination,
    Skeleton,
    Stack,
    Typography,
} from "@mui/material";
import { DeleteOutlined, OpenInNew } from "@mui/icons-material";
import api from "../api/axios";
import { useNotify } from "../context/NotificationContext";

const PAGE_SIZE = 6;

export default function SavedExperiencesPage() {
    const [experiences, setExperiences] = useState([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [removingId, setRemovingId] = useState(null);
    const [refresh, setRefresh] = useState(0);
    const notify = useNotify();

    const loadExperiences = useCallback(async (signal) => {
        setLoading(true);
        setError("");
        try {
            const { data } = await api.get("/experiences/saved", {
                params: { page, limit: PAGE_SIZE },
                signal,
            });
            const nextTotalPages = Math.max(1, Number(data?.totalPages) || 1);

            if (page > nextTotalPages) {
                setPage(nextTotalPages);
                return;
            }

            setExperiences(Array.isArray(data?.items) ? data.items : []);
            setTotalPages(nextTotalPages);
        } catch (requestError) {
            if (requestError?.code !== "ERR_CANCELED") {
                setExperiences([]);
                setError("We couldn’t load your saved experiences. Check your connection and try again.");
            }
        } finally {
            if (!signal.aborted) setLoading(false);
        }
    }, [page]);

    useEffect(() => {
        const controller = new AbortController();
        loadExperiences(controller.signal);
        return () => controller.abort();
    }, [loadExperiences, refresh]);

    const removeExperience = async (experience) => {
        setRemovingId(experience._id);
        setError("");
        try {
            await api.delete(`/experiences/saved/${experience._id}`);
            if (experiences.length === 1 && page > 1) {
                setPage((currentPage) => currentPage - 1);
            } else {
                setRefresh((value) => value + 1);
            }
            notify(`Removed “${experience.title || "this experience"}”.`, "success");
        } catch {
            notify(`We couldn’t remove “${experience.title || "this experience"}”. Please try again.`, "error");
        } finally {
            setRemovingId(null);
        }
    };

    return (
        <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 5 } }}>
            <Box sx={{ mb: 3 }}>
                <Typography component="h1" variant="h4" fontWeight={800}>Saved company insights</Typography>
                <Typography color="text.secondary" sx={{ mt: 0.75 }}>
                    Revisit company and role insights you saved for later.
                </Typography>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

            {loading ? (
                <Grid container spacing={2} role="status" aria-label="Loading saved experiences">
                    {[0, 1, 2].map((item) => (
                        <Grid key={item} size={{ xs: 12, md: 6 }}>
                            <Skeleton variant="rounded" height={210} />
                        </Grid>
                    ))}
                    <Typography component="span" sx={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
                        Loading saved experiences…
                    </Typography>
                </Grid>
            ) : experiences.length === 0 ? (
                <Alert severity="info">You haven’t saved any interview experiences yet.</Alert>
            ) : (
                <Grid container spacing={2}>
                    {experiences.map((experience) => (
                        <Grid key={experience._id} size={{ xs: 12, md: 6 }} sx={{ display: "flex" }}>
                            <Card variant="outlined" sx={{ display: "flex", flexDirection: "column", width: "100%" }}>
                                <CardContent sx={{ flexGrow: 1 }}>
                                    <Typography component="h2" variant="h6" fontWeight={750}>
                                        {experience.title || "Interview experience"}
                                    </Typography>
                                    {(experience.company || experience.role) && (
                                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                            {[experience.company, experience.role].filter(Boolean).join(" · ")}
                                        </Typography>
                                    )}
                                    {experience.snippet && (
                                        <Typography variant="body2" sx={{ mt: 2 }}>{experience.snippet}</Typography>
                                    )}
                                </CardContent>
                                <CardActions sx={{ px: 2, pb: 2, flexWrap: "wrap", gap: 1 }}>
                                    {experience.url && (
                                        <Button
                                            component="a"
                                            href={experience.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            size="small"
                                            endIcon={<OpenInNew />}
                                            aria-label={`Open source for ${experience.title || "interview experience"} in a new tab`}
                                        >
                                            Open source
                                        </Button>
                                    )}
                                    <Button
                                        color="error"
                                        size="small"
                                        startIcon={removingId === experience._id ? <CircularProgress size={16} color="inherit" /> : <DeleteOutlined />}
                                        disabled={removingId !== null}
                                        onClick={() => removeExperience(experience)}
                                        aria-label={`Remove ${experience.title || "interview experience"} from saved experiences`}
                                    >
                                        {removingId === experience._id ? "Removing…" : "Remove"}
                                    </Button>
                                </CardActions>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            )}

            {!loading && totalPages > 1 && (
                <Stack alignItems="center" sx={{ mt: 4 }}>
                    <Pagination
                        page={page}
                        count={totalPages}
                        onChange={(_, nextPage) => setPage(nextPage)}
                        color="primary"
                        aria-label="Saved experience pages"
                    />
                </Stack>
            )}
        </Container>
    );
}
