import { Box } from "@mui/material";

// Scope the public-site typography and surfaces without changing application workspaces.
export default function PublicSiteFrame({ children, ...props }) {
    return <Box {...props} sx={{
        bgcolor: "background.paper", color: "text.primary",
        "& .MuiTypography-root": { overflowWrap: "normal" },
        "& h1": { fontSize: { xs: "2.5rem", sm: "3.25rem", md: "3.8rem" }, fontWeight: "650 !important", lineHeight: "1.12 !important", letterSpacing: "-.045em !important" },
        "& h2": { fontSize: { xs: "1.8rem", md: "2.3rem" }, fontWeight: "650 !important", lineHeight: 1.2, letterSpacing: "-.025em !important" },
        "& .MuiCard-root h2": { fontSize: "1.35rem", letterSpacing: "-.015em !important" },
        "& h3": { fontSize: "1.2rem", fontWeight: "650 !important", lineHeight: 1.4 },
        "& .MuiButton-root": { borderRadius: "4px", boxShadow: "none", fontWeight: 600, px: 2.5 },
        "& .MuiPaper-outlined, & .MuiCard-root": { borderRadius: "4px !important", boxShadow: "none !important" },
        "& .MuiChip-outlined": { border: 0, borderRadius: 0, color: "text.secondary", letterSpacing: ".08em", textTransform: "uppercase", fontSize: ".7rem", "& .MuiChip-label": { px: 0 } },
        "& .MuiTypography-overline": { fontSize: ".7rem", letterSpacing: ".12em", fontWeight: "600 !important", color: "text.secondary" },
        "& a:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 4 },
        ...props.sx,
    }}>{children}</Box>;
}
