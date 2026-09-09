import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Box, CircularProgress, Typography } from "@mui/material";
import { writePracticeCreateDraft } from "../utils/practiceCreateDraft";

export default function WeeklyPlanSessionPage() {
    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const jobRole = (params.get("role") || "").trim();
        const jobDescription = (params.get("description") || "").trim();
        const session = params.get("session") || "";

        if (!jobRole || !jobDescription) {
            navigate("/practice/dashboard", { replace: true });
            return;
        }

        writePracticeCreateDraft({
            formData: {
                company: "",
                jobRole,
                jobDescription,
                resumeId: "",
            },
            suggestedRounds: [],
            grounding: null,
            selectedRounds: [],
            activeStep: 0,
            weeklyPlanSession: session,
        });

        navigate(`/practice/new?source=weekly-plan${session ? `&session=${encodeURIComponent(session)}` : ""}`, { replace: true });
    }, [location.search, navigate]);

    return <Box sx={{ minHeight: "55vh", display: "grid", placeItems: "center", textAlign: "center", px: 2 }}>
        <Box>
            <CircularProgress size={28} />
            <Typography color="text.secondary" mt={2}>Preparing your weekly practice session…</Typography>
        </Box>
    </Box>;
}
