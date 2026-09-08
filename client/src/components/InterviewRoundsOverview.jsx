import { Box, Link, Paper, Stack, Typography } from "@mui/material";

import RoundList from "./RoundList";

const InterviewRoundsOverview = ({ interview, selectedRoundId, onSelect }) => {
    if (!interview) return null;

    const completed = (interview.rounds || []).filter(({ round }) => round?.status === "completed").length;
    const total = interview.rounds?.length || 0;

    return (
        <Paper
            variant="outlined"
            sx={{
                width: "100%",
                maxWidth: 900,
                mx: "auto",
                p: { xs: 2, sm: 3, md: 4 },
                borderRadius: 3,
            }}
        >
            <Stack spacing={0.75} mb={3}>
                <Typography variant="overline" color="primary.main" fontWeight={850}>
                    Interview rounds
                </Typography>
                <Typography component="h1" variant="h4" fontWeight={850}>
                    Choose your next round
                </Typography>
                <Typography color="text.secondary">
                    {completed} of {total} completed. Finish rounds in order; once you enter a round, the workspace stays focused on that round only.
                </Typography>
            </Stack>

            <RoundList
                interview={interview}
                selectedRoundId={selectedRoundId}
                onSelect={onSelect}
                showOnMobile
            />

            <Box component="details" sx={{ mt: 3 }}>
                <Typography
                    component="summary"
                    variant="body2"
                    color="text.secondary"
                    fontWeight={700}
                    sx={{ cursor: "pointer", userSelect: "none" }}
                >
                    Why these questions?
                </Typography>
                <Typography variant="body2" color="text.secondary" display="block" mt={1}>
                    {interview?.grounding?.status === "grounded"
                        ? `Built from your JD, resume, and ${interview.grounding.sources?.length || 0} public interview source${interview.grounding.sources?.length === 1 ? "" : "s"}.`
                        : "Built from your JD, role, and resume because limited public company-specific evidence was available."}
                </Typography>
                {(interview?.grounding?.sources || []).slice(0, 3).map((source) => (
                    <Link
                        key={source.url}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        display="block"
                        variant="body2"
                        mt={0.75}
                    >
                        {source.title}
                    </Link>
                ))}
            </Box>
        </Paper>
    );
};

export default InterviewRoundsOverview;
