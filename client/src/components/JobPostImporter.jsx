import { useMemo, useState } from "react";
import { Alert, Box, Button, CircularProgress, Collapse, Link, Stack, TextField, Typography } from "@mui/material";
import { ExpandMoreRounded, LinkRounded } from "@mui/icons-material";
import api from "../api/axios";

const safeHostname = (value) => {
    try {
        return value ? new URL(value).hostname : "job post";
    } catch {
        return "job post";
    }
};

export default function JobPostImporter({ onImport }) {
    const [url, setUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [result, setResult] = useState(null);
    const [expanded, setExpanded] = useState(false);
    const importedHost = useMemo(() => safeHostname(result?.sourceUrl), [result?.sourceUrl]);

    const importPost = async () => {
        setLoading(true); setError(""); setResult(null);
        try {
            const { data } = await api.post("/job-posts/import", { url: url.trim() });
            setResult(data); onImport?.(data); setExpanded(false);
        } catch (requestError) {
            setError(requestError?.response?.data?.message || "The job post couldn’t be imported. Enter the details manually instead.");
        } finally { setLoading(false); }
    };

    return <Box sx={{ border: "1px solid", borderColor: result ? "success.light" : "divider", borderRadius: 2.5, overflow: "hidden" }}>
        <Button type="button" fullWidth onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} startIcon={<LinkRounded />} endIcon={<ExpandMoreRounded sx={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform .2s" }} />} sx={{ px: 2, py: 1.35, justifyContent: "flex-start", color: "text.primary", "& .MuiButton-endIcon": { ml: "auto" } }}>
            <Box textAlign="left"><Typography fontWeight={800} lineHeight={1.2}>{result ? "Job post imported" : "Have a job-post link?"}</Typography><Typography variant="caption" color="text.secondary">Prefill the role, company, and description</Typography></Box>
        </Button>
        <Collapse in={expanded}>
            <Box sx={{ px: 2, pb: 2, borderTop: "1px solid", borderColor: "divider" }}>
                <Typography variant="body2" color="text.secondary" mt={1.5}>Paste a public employer or job-board link. You’ll review and edit every imported field before continuing.</Typography>
                <Stack direction={{ xs: "column", sm: "row" }} gap={1} mt={1.5} alignItems="flex-start">
                    <TextField fullWidth size="small" type="url" label="Job post URL" placeholder="https://company.com/jobs/123" value={url} onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && /^https?:\/\//i.test(url.trim())) { event.preventDefault(); importPost(); } }} inputProps={{ maxLength: 2048 }} />
                    <Button type="button" variant="outlined" startIcon={loading ? <CircularProgress size={18} /> : <LinkRounded />} disabled={loading || !/^https?:\/\//i.test(url.trim())} onClick={importPost} sx={{ minWidth: 150, minHeight: 40 }}>{loading ? "Importing…" : "Import details"}</Button>
                </Stack>
            </Box>
        </Collapse>
        <Box aria-live="polite">
            {error && <Alert severity="warning" sx={{ borderRadius: 0 }}>{error}</Alert>}
            {result && <Alert severity="success" sx={{ borderRadius: 0 }}>Imported from {result.sourceUrl ? <Link href={result.sourceUrl} target="_blank" rel="noreferrer">{importedHost}</Link> : importedHost}. Review the editable details below.</Alert>}
        </Box>
    </Box>;
}
