import PublicSiteFrame from "../components/PublicSiteFrame";
import { Alert, Box, Container, Divider, Paper, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import Seo from "../components/Seo";
import SiteFooter from "../components/SiteFooter";
import { OIDC_SSO_DOC } from "../utils/publicPageContent";

export default function OidcSsoDocsPage() {
    const title = "Configure OpenID Connect (OIDC) work SSO | EvalcueAI Docs";
    const { description, steps } = OIDC_SSO_DOC;

    return (
        <PublicSiteFrame>
            <Container maxWidth="md" sx={{ py: { xs: 5, md: 9 } }}>
                <Seo
                    title={title}
                    description={description}
                    canonicalPath="/docs/hiring/oidc-sso"
                    structuredData={{
                        "@context": "https://schema.org",
                        "@type": "TechArticle",
                        headline: "Configure OpenID Connect (OIDC) work SSO",
                        description,
                        author: { "@type": "Organization", name: "EvalcueAI" },
                        publisher: { "@type": "Organization", name: "EvalcueAI" },
                    }}
                />
                <Stack spacing={2}>
                    <Typography component={RouterLink} to="/docs" color="primary.main" sx={{ textDecoration: "none", fontWeight: 800 }}>← Documentation</Typography>
                    <Typography variant="overline" color="primary.main" fontWeight={850}>{OIDC_SSO_DOC.eyebrow}</Typography>
                    <Typography component="h1" variant="h2" fontWeight={900} letterSpacing="-.04em">{OIDC_SSO_DOC.title}</Typography>
                    <Typography variant="h6" color="text.secondary">{description}</Typography>
                </Stack>

                <Alert severity="info" sx={{ mt: 4 }}>{OIDC_SSO_DOC.notice}</Alert>
                <Divider sx={{ my: 5 }} />

                <Stack spacing={4}>
                    {steps.map(([heading, body]) => (
                        <Paper component="section" variant="outlined" sx={{ p: 3, borderRadius: 4 }} key={heading}>
                            <Typography component="h2" variant="h5" fontWeight={850}>{heading}</Typography>
                            <Typography color="text.secondary" mt={1.25} sx={{ lineHeight: 1.8 }}>{body}</Typography>
                        </Paper>
                    ))}
                </Stack>

                <Divider sx={{ my: 5 }} />
                <Typography component="h2" variant="h4" fontWeight={850}>Security behavior</Typography>
                <Stack component="ul" spacing={1.25} sx={{ pl: 3, color: "text.secondary", lineHeight: 1.7 }}>
                    {OIDC_SSO_DOC.securityBehavior.map((item) => <li key={item}>{item}</li>)}
                </Stack>
            </Container>
            <SiteFooter />
        </PublicSiteFrame>
    );
}
