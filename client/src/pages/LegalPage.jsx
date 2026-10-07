import PublicSiteFrame from "../components/PublicSiteFrame";
import { Box, Container, Link, Paper, Stack, Typography } from "@mui/material";
import { BUSINESS_LEGAL_NAME } from "../utils/brandEntity";
import SiteFooter from "../components/SiteFooter";
import { publicSupportEmail } from "../utils/publicContact";
import { PRIVACY_SECTIONS as privacySections, TERMS_SECTIONS as termsSections } from "../utils/publicPageContent";

export default function LegalPage({ type }) {
    const privacy = type === "privacy";
    const sections = privacy ? privacySections : termsSections;
    return (
        <PublicSiteFrame>
            <Container maxWidth="md" sx={{ py: { xs: 5, md: 8 } }}>
                <Paper variant="outlined" sx={{ py: { xs: 2, md: 3 }, border: 0 }}>
                    <Typography variant="overline" color="primary.main" fontWeight={800}>EvalcueAI</Typography>
                    <Typography component="h1" variant="h3" fontWeight={800} mt={1}>{privacy ? "Privacy notice" : "Terms of use"}</Typography>
                    <Typography color="text.secondary" mt={1}>Effective October 1, 2026</Typography>
                    <Typography color="text.secondary" mt={2} lineHeight={1.75}>
                        {privacy ? "How we collect, use, share, and protect your information, and the choices available to you." : "The terms for using our practice tools, hiring assessments, and paid services."}
                    </Typography>
                    <Box component="nav" aria-label="On this page" sx={{ mt: 4, p: 2.5, bgcolor: "action.hover", borderRadius: 2 }}>
                        <Typography fontWeight={750} mb={1}>On this page</Typography>
                        <Stack spacing={.75}>
                            {sections.map(([title], index) => <Link key={title} href={`#section-${index + 1}`} underline="hover">{index + 1}. {title}</Link>)}
                            <Link href="#legal-contact" underline="hover">Contact and business details</Link>
                        </Stack>
                    </Box>
                    <Stack spacing={4} mt={5}>
                        {sections.map(([title, body], index) => <Box component="section" id={`section-${index + 1}`} key={title} sx={{ scrollMarginTop: 96 }}><Typography component="h2" variant="h6" fontWeight={750}>{title}</Typography><Typography color="text.secondary" mt={1} lineHeight={1.75}>{body}</Typography></Box>)}
                        <Box component="section" id="legal-contact" sx={{ scrollMarginTop: 96 }}>
                            <Typography component="h2" variant="h6" fontWeight={750}>Contact and business details</Typography>
                            <Typography color="text.secondary" mt={1}>EvalcueAI is operated by {BUSINESS_LEGAL_NAME}.</Typography>
                            <Typography color="text.secondary" mt={1}>
                                {publicSupportEmail ? <>Contact <Link href={`mailto:${publicSupportEmail}`}>{publicSupportEmail}</Link>.</> : "Contact the support channel provided by your EvalcueAI deployment administrator."}
                            </Typography>
                        </Box>
                    </Stack>
                </Paper>
            </Container>
            <SiteFooter />
        </PublicSiteFrame>
    );
}
