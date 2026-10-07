import { Link as RouterLink, useLocation } from "react-router-dom";
import { Button, Container, Stack, Typography } from "@mui/material";
import PublicSiteFrame from "../components/PublicSiteFrame";
import SiteFooter from "../components/SiteFooter";
import Seo from "../components/Seo";

// Unknown URLs used to redirect silently to "/", which hid broken links from visitors and crawlers alike.
// SearchIndexPolicy marks this page noindex because its path is not a public route.
export default function NotFoundPage() {
    const { pathname } = useLocation();
    return (
        <PublicSiteFrame>
            <Seo title="Page not found | EvalcueAI" description="This page does not exist or has moved." canonicalPath={pathname} />
            <Container maxWidth="md" sx={{ py: { xs: 8, md: 12 } }}>
                <Typography variant="overline" color="text.secondary">Error 404</Typography>
                <Typography component="h1" variant="h3" fontWeight={850} mt={1}>Page not found</Typography>
                <Typography color="text.secondary" mt={2}>The link may be broken, or the page may have moved. Try one of these instead.</Typography>
                <Stack direction={{ xs: "column", sm: "row" }} useFlexGap flexWrap="wrap" gap={1.5} mt={4} sx={{ "& .MuiButton-root": { whiteSpace: "nowrap" } }}>
                    <Button component={RouterLink} to="/" variant="contained">EvalcueAI home</Button>
                    <Button component={RouterLink} to="/practice" variant="outlined">Interview practice</Button>
                    <Button component={RouterLink} to="/hire" variant="outlined">Technical hiring</Button>
                    <Button component={RouterLink} to="/docs" variant="text">Documentation</Button>
                </Stack>
            </Container>
            <SiteFooter />
        </PublicSiteFrame>
    );
}
