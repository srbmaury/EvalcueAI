import { Link as RouterLink } from "react-router-dom";
import { Box, Container, Grid, Link, Stack, Typography } from "@mui/material";
import { publicContactEmail, publicSalesEmail, publicSupportEmail } from "../utils/publicContact";
import { BUSINESS_LEGAL_NAME } from "../utils/brandEntity";
import { deploymentOrigins } from "../utils/deploymentSurface";

export default function SiteFooter() {
    const origins = deploymentOrigins();
    const landing = origins.landing;
    const siteLink = (path) => landing ? { href: `${landing}${path}` } : { component: RouterLink, to: path };
    return <Box component="footer" sx={{ borderTop: "1px solid", borderColor: "divider", py: { xs: 5, md: 7 }, bgcolor: "background.paper" }}>
        <Container maxWidth="lg">
            <Grid container spacing={4}>
                <Grid size={{ xs: 12, md: 5 }}>
                    <Typography fontWeight={650} fontSize="1.2rem" letterSpacing="-.025em">EvalcueAI</Typography>
                    <Typography variant="body2" color="text.secondary" lineHeight={1.8} mt={1.5} maxWidth={310}>Interview practice for engineers.<br />Structured assessments for hiring teams.</Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                    <Typography variant="body2" fontWeight={650} mb={2}>Product</Typography>
                    <Stack spacing={1.5}>
                        <Link href={`${origins.practice || "https://practice.evalcueai.com"}/practice`} color="text.secondary" underline="hover" variant="body2">Interview practice</Link>
                        <Link href={`${origins.hiring || "https://hiring.evalcueai.com"}/hire`} color="text.secondary" underline="hover" variant="body2">Technical hiring</Link>
                        <Link {...siteLink("/docs")} color="text.secondary" underline="hover" variant="body2">Documentation</Link>
                    </Stack>
                </Grid>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                    <Typography variant="body2" fontWeight={650} mb={2}>Company</Typography>
                    <Stack spacing={1.5}>
                        {[["About", "/about"], ["How we evaluate", "/ai-interview-evaluation-methodology"], ["Privacy", "/privacy"], ["Terms", "/terms"]].map(([label, path]) => <Link key={path} {...siteLink(path)} color="text.secondary" underline="hover" variant="body2">{label}</Link>)}
                    </Stack>
                </Grid>
                <Grid size={{ xs: 12, sm: 4, md: 3 }}>
                    <Typography variant="body2" fontWeight={650} mb={2}>Contact</Typography>
                    <Stack spacing={1.5}>
                        {[["General enquiries", publicContactEmail], ["Support", publicSupportEmail], ["Sales", publicSalesEmail]].map(([label, email]) => <Link key={label} href={`mailto:${email}`} color="text.secondary" underline="hover" variant="body2">{label}</Link>)}
                    </Stack>
                </Grid>
            </Grid>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 5, pt: 3, borderTop: "1px solid", borderColor: "divider" }}>© {new Date().getFullYear()} EvalcueAI · Operated by {BUSINESS_LEGAL_NAME}</Typography>
        </Container>
    </Box>;
}
