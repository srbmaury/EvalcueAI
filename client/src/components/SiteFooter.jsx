import { Link as RouterLink, useLocation } from "react-router-dom";
import { Box, Container, Link, Stack, Typography } from "@mui/material";
import { publicContactEmail, publicSalesEmail, publicSupportEmail } from "../utils/publicContact";
import { deploymentOrigins } from "../utils/deploymentSurface";

export default function SiteFooter() {
    const origins = deploymentOrigins();
    const { pathname } = useLocation();
    const onLandingSurface = !pathname.startsWith("/practice/") && !pathname.startsWith("/hire/")
        && pathname !== "/practice" && pathname !== "/hire";
    return (
        <Box component="footer" sx={{ borderTop: "1px solid", borderColor: "divider", py: 4 }}>
            <Container maxWidth="lg">
                <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={2}>
                    <Typography variant="body2" color="text.secondary">© {new Date().getFullYear()} EvalcueAI</Typography>
                    <Stack direction="row" spacing={2.5} flexWrap="wrap" useFlexGap>
                        <Link href={`${origins.practice || "https://practice.evalcueai.com"}/practice`} color="text.secondary">Interview practice</Link>
                        <Link href={`${origins.hiring || "https://hiring.evalcueai.com"}/hire`} color="text.secondary">Technical hiring</Link>
                        {onLandingSurface && <Link component={RouterLink} to="/docs" color="text.secondary">Docs</Link>}
                        {onLandingSurface && <Link component={RouterLink} to="/ai-interview-evaluation-methodology" color="text.secondary">How we evaluate</Link>}
                        {onLandingSurface && <Link component={RouterLink} to="/about" color="text.secondary">About</Link>}
                        {onLandingSurface && <Link component={RouterLink} to="/privacy" color="text.secondary">Privacy</Link>}
                        {onLandingSurface && <Link component={RouterLink} to="/terms" color="text.secondary">Terms</Link>}
                        <Link href={`mailto:${publicContactEmail}`} color="text.secondary">Contact</Link>
                        <Link href={`mailto:${publicSupportEmail}`} color="text.secondary">Support</Link>
                        <Link href={`mailto:${publicSalesEmail}`} color="text.secondary">Sales</Link>
                    </Stack>
                </Stack>
            </Container>
        </Box>
    );
}
