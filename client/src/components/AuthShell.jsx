import { AutoAwesome, SchoolOutlined, WorkOutlineRounded } from "@mui/icons-material";
import { Box, Container, Paper, Stack, Typography } from "@mui/material";

const SURFACE_COPY = {
    practice: {
        icon: <SchoolOutlined />,
        label: "EvalcueAI Practice",
        headline: "Prepare against the role you actually want.",
        body: "Keep personal practice focused on your target role, resume, technical gaps, and improvement over time.",
        bullets: ["Adaptive technical interviews", "Resume and job-description context", "Evidence-backed feedback and progress"],
    },
    hiring: {
        icon: <WorkOutlineRounded />,
        label: "EvalcueAI Hire",
        headline: "Build a clearer technical hiring process.",
        body: "Create assessments, invite candidates, and review their work with your team.",
        bullets: ["Structured adaptive assessments", "Candidate pipeline and reports", "Human review and scoring calibration"],
    },
    combined: {
        icon: <AutoAwesome />,
        label: "EvalcueAI",
        headline: "One account. Two purpose-built products.",
        body: "Use Practice for your own interview preparation and Hire for organization-owned candidate assessment workflows.",
        bullets: ["Private candidate practice", "Organization-owned hiring workflows", "One account for both products"],
    },
};

export default function AuthShell({ eyebrow, title, subtitle, children, surface = "combined" }) {
    const config = SURFACE_COPY[surface] || SURFACE_COPY.combined;
    return (
        <Box sx={(theme) => ({
            minHeight: { xs: "calc(100dvh - 65px)", md: "calc(100dvh - 73px)" },
            display: "grid",
            alignItems: "center",
            py: { xs: 4, md: 7 },
            "& .MuiOutlinedInput-root, & .MuiButton-root": { borderRadius: "4px", boxShadow: "none" },
            background: theme.palette.background.paper,
        })}>
            <Container maxWidth="lg">
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0,.88fr) minmax(440px,1fr)" }, gap: { xs: 4, md: 7 }, alignItems: "center" }}>
                    <Stack spacing={2.25} sx={{ display: { xs: "none", md: "flex" }, maxWidth: 500 }}>
                        <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: ".1em" }}>{config.label}</Typography>
                        <Typography component="h2" variant="h3" fontWeight={650} letterSpacing="-.035em" lineHeight={1.2} sx={{ fontSize: "2.8rem" }}>{config.headline}</Typography>
                        <Typography color="text.secondary" fontSize="1.05rem" lineHeight={1.6}>{config.body}</Typography>
                        <Stack spacing={1.15} pt={0.5}>
                            {config.bullets.map((item) => (
                                <Stack direction="row" spacing={1.25} alignItems="center" key={item}><Box component="span" sx={{ width: 5, height: 5, bgcolor: surface === "hiring" ? "secondary.main" : "primary.main", flexShrink: 0 }} /><Typography color="text.secondary">{item}</Typography></Stack>
                            ))}
                        </Stack>
                    </Stack>
                    <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: "4px", overflow: "hidden" }}>
                        <Box sx={{ px: { xs: 2.5, sm: 4 }, py: { xs: 2.5, sm: 3 } }}>
                            <Typography variant="overline" color="text.secondary" fontWeight={600}>{eyebrow}</Typography>
                            <Typography component="h1" variant="h4" fontWeight={800} letterSpacing="-.025em" lineHeight={1.15} mt={.5} sx={{ fontSize: { xs: "1.6rem", md: "1.85rem" } }}>{title}</Typography>
                            <Typography variant="body2" color="text.secondary" mt={0.75} lineHeight={1.55}>{subtitle}</Typography>
                            <Box mt={{ xs: 2.5, md: 2.25 }}>{children}</Box>
                        </Box>
                    </Paper>
                </Box>
            </Container>
        </Box>
    );
}
