import { AutoAwesome, CheckCircleRounded, SchoolOutlined, WorkOutlineRounded } from "@mui/icons-material";
import { Box, Chip, Container, Paper, Stack, Typography } from "@mui/material";

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
        headline: "Collect stronger technical signal before the live panel.",
        body: "Keep organization-owned assessments, candidate evidence, team access, and calibration inside a dedicated hiring product.",
        bullets: ["Structured adaptive assessments", "Candidate pipeline and reports", "Human review and scoring calibration"],
    },
    combined: {
        icon: <AutoAwesome />,
        label: "EvalcueAI",
        headline: "One account. Two purpose-built products.",
        body: "Use Practice for your own interview preparation and Hire for organization-owned candidate assessment workflows.",
        bullets: ["Private candidate practice", "Organization-owned hiring workflows", "Shared interview intelligence underneath"],
    },
};

export default function AuthShell({ eyebrow, title, subtitle, children, surface = "combined" }) {
    const config = SURFACE_COPY[surface] || SURFACE_COPY.combined;
    return (
        <Box sx={(theme) => ({
            minHeight: { xs: "calc(100dvh - 65px)", md: "calc(100dvh - 73px)" },
            display: "grid",
            alignItems: "center",
            py: { xs: 2, md: 2 },
            background: surface === "hiring"
                ? theme.palette.mode === "dark"
                    ? "radial-gradient(circle at 12% 15%, rgba(31,156,142,.18), transparent 28%), #081412"
                    : "radial-gradient(circle at 12% 15%, rgba(31,156,142,.10), transparent 30%), #f4fbf9"
                : theme.palette.mode === "dark"
                    ? "#0e0f11"
                    : "radial-gradient(circle at 12% 15%, rgba(36,81,199,.08), transparent 30%), #f7f8fa",
        })}>
            <Container maxWidth="lg">
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0,.88fr) minmax(440px,1fr)" }, gap: { xs: 4, md: 7 }, alignItems: "center" }}>
                    <Stack spacing={2.25} sx={{ display: { xs: "none", md: "flex" }, maxWidth: 500 }}>
                        <Chip icon={config.icon} label={config.label} color="primary" variant="outlined" sx={{ alignSelf: "flex-start" }} />
                        <Typography variant="h3" fontWeight={850} letterSpacing="-.045em" lineHeight={1.05}>{config.headline}</Typography>
                        <Typography color="text.secondary" fontSize="1.05rem" lineHeight={1.6}>{config.body}</Typography>
                        <Stack spacing={1.15} pt={0.5}>
                            {config.bullets.map((item) => (
                                <Stack direction="row" spacing={1.25} alignItems="center" key={item}><CheckCircleRounded color="secondary" fontSize="small" /><Typography fontWeight={650}>{item}</Typography></Stack>
                            ))}
                        </Stack>
                    </Stack>
                    <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, overflow: "hidden", boxShadow: "0 20px 60px rgba(24,29,60,.10)" }}>
                        <Box sx={{ px: { xs: 2.5, sm: 4 }, py: { xs: 2.5, sm: 3 } }}>
                            <Typography variant="overline" color="primary.main" fontWeight={850}>{eyebrow}</Typography>
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
