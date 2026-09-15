import { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Alert, Box, Button, Card, CardContent, CircularProgress, Container, Paper, Stack, TextField, Typography } from "@mui/material";
import api from "../api/axios";
import { BookmarkAddOutlined, BookmarkRounded } from "@mui/icons-material";
import { useNotify } from "../context/NotificationContext";

const ExperiencesPage = () => {
    const [expCompany, setExpCompany] = useState("");
    const [expRole, setExpRole] = useState("");
    const [expLoading, setExpLoading] = useState(false);
    const [experiences, setExperiences] = useState([]);
    const [searched, setSearched] = useState(false);
    const [error, setError] = useState("");
    const [savedUrls, setSavedUrls] = useState(new Set());
    const [savingUrl, setSavingUrl] = useState("");
    const notify = useNotify();

    useEffect(() => {
        api.get("/experiences/saved", { params: { page: 1, limit: 50 } })
            .then(({ data }) => setSavedUrls(new Set((Array.isArray(data?.items) ? data.items : []).map((item) => item.url))))
            .catch(() => {});
    }, []);

    const saveResult = async (item) => {
        // savingUrl check closes the window between two fast clicks: savedUrls only
        // updates after the request resolves, so relying on it alone lets a second click
        // land before the first save completes and fire a duplicate POST.
        if (!item?.url || savedUrls.has(item.url) || savingUrl === item.url) return;
        setSavingUrl(item.url);
        try {
            const { data } = await api.post("/experiences/saved", { ...item, company: expCompany.trim(), role: expRole.trim() });
            if (data?.url) setSavedUrls((current) => new Set([...current, data.url]));
            notify("Insight saved.", "success");
        } catch (saveError) {
            notify(saveError?.response?.data?.message || "Could not save this insight.", "error");
        } finally {
            setSavingUrl("");
        }
    };

    const fetchExperiences = async () => {
        if (!expCompany.trim() || !expRole.trim()) return;
        setExpLoading(true);
        setError("");
        try {
            const params = new URLSearchParams({ company: expCompany.trim(), role: expRole.trim() });
            const { data } = await api.get(`/experiences/search?${params.toString()}`);
            setExperiences(Array.isArray(data?.results) ? data.results : []);
        } catch {
            setExperiences([]);
            setError("We couldn’t load experiences. Check your connection and try again.");
        } finally {
            setSearched(true);
            setExpLoading(false);
        }
    };

    return (
        <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 5 } }}>
            <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={2} sx={{ mb: 3 }}><Box><Typography component="h1" variant="h4" fontWeight={800}>Company interview insights</Typography><Typography color="text.secondary" sx={{ mt: .75 }}>See what candidates have shared about interviews for a specific company and role.</Typography></Box><Button component={RouterLink} to="/practice/saved-experiences" variant="outlined">Saved insights</Button></Stack>
            <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "stretch", sm: "center" }}>
                    <TextField fullWidth size="small" label="Company" value={expCompany} onChange={(e) => setExpCompany(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") fetchExperiences(); }} />
                    <TextField fullWidth size="small" label="Role" value={expRole} onChange={(e) => setExpRole(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") fetchExperiences(); }} />
                    <Button variant="contained" onClick={fetchExperiences} disabled={expLoading || !expCompany.trim() || !expRole.trim()} sx={{ minWidth: 120 }}>
                        {expLoading ? "Searching..." : "Search"}
                    </Button>
                </Stack>
                {!searched && <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>Enter both a company and role to search.</Typography>}
                <Stack spacing={2} sx={{ mt: 2 }}>
                    {error ? (
                        <Alert severity="error">{error}</Alert>
                    ) : expLoading ? (
                        <CircularProgress />
                    ) : searched && experiences.length === 0 ? (
                        <Alert severity="info">No shared experiences found. Try a broader role title or check the company spelling.</Alert>
                    ) : !searched ? (
                        <Typography color="text.secondary">Results will appear here.</Typography>
                    ) : (
                        experiences.map((item, idx) => (
                            <Card key={idx} variant="outlined">
                                <CardContent>
                                    <Typography variant="subtitle1" gutterBottom>{item.title || "Result"}</Typography>
                                    <Typography variant="body2" color="text.secondary" gutterBottom>{item.snippet}</Typography>
                                    <Stack direction="row" spacing={1}>
                                        <Button href={item.url} target="_blank" rel="noreferrer" size="small">Open source</Button>
                                        <Button
                                            size="small"
                                            startIcon={savedUrls.has(item.url) ? <BookmarkRounded /> : <BookmarkAddOutlined />}
                                            disabled={savedUrls.has(item.url) || savingUrl === item.url}
                                            onClick={() => saveResult(item)}
                                        >{savedUrls.has(item.url) ? "Saved" : savingUrl === item.url ? "Saving…" : "Save"}</Button>
                                    </Stack>
                                </CardContent>
                            </Card>
                        ))
                    )}
                </Stack>
            </Paper>
        </Container>
    );
};

export default ExperiencesPage;
