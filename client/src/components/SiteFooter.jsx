import { Link as RouterLink } from "react-router-dom";
import { Box, Container, Link, Stack, Typography } from "@mui/material";
import { publicContactEmail, publicSalesEmail, publicSupportEmail } from "../utils/publicContact";

export default function SiteFooter() {
    return (
        <Box component="footer" sx={{ borderTop: "1px solid", borderColor: "divider", py: 4 }}>
            <Container maxWidth="lg">
                <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={2}>
                    <Typography variant="body2" color="text.secondary">© {new Date().getFullYear()} Evalcue AI</Typography>
                    <Stack direction="row" spacing={2.5} flexWrap="wrap" useFlexGap>
                        <Link component={RouterLink} to="/interview-practice" color="text.secondary">Interview practice</Link>
                        <Link component={RouterLink} to="/technical-hiring" color="text.secondary">Technical hiring</Link>
                        <Link component={RouterLink} to="/docs" color="text.secondary">Docs</Link>
                        <Link component={RouterLink} to="/privacy" color="text.secondary">Privacy</Link>
                        <Link component={RouterLink} to="/terms" color="text.secondary">Terms</Link>
                        <Link href={`mailto:${publicContactEmail}`} color="text.secondary">Contact</Link>
                        <Link href={`mailto:${publicSupportEmail}`} color="text.secondary">Support</Link>
                        <Link href={`mailto:${publicSalesEmail}`} color="text.secondary">Sales</Link>
                    </Stack>
                </Stack>
            </Container>
        </Box>
    );
}
