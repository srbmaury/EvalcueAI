import PublicSiteFrame from "../components/PublicSiteFrame";
import { Alert, Box, Container, Divider, Paper, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import Seo from "../components/Seo";
import SiteFooter from "../components/SiteFooter";

const steps = [
    ["1. Create an OIDC application in your identity provider", "Use Microsoft Entra ID, Okta, Auth0, Google Workspace, or another standards-compliant OpenID Connect provider. Configure an authorization-code web application and keep its client secret private."],
    ["2. Register the EvalcueAI callback URL", "Set the redirect URI to your EvalcueAI API origin followed by /api/sso/callback. The URI must exactly match the redirect registered with your identity provider."],
    ["3. Copy the issuer, client ID, and client secret", "The issuer should be the provider’s OpenID Connect issuer URL—not an authorization endpoint copied by hand. EvalcueAI validates discovery metadata before enabling the configuration."],
    ["4. Claim your work email domains", "Add the organization domains whose asserted email identities may enter this EvalcueAI organization. A domain can be enabled for only one organization at a time."],
    ["5. Choose membership provisioning", "With just-in-time provisioning disabled, an Owner or Admin must add the user to the organization before SSO succeeds. With JIT enabled, a successful identity can be added automatically using the configured default role."],
    ["6. Test with a least-privilege account", "Start with Reviewer as the JIT default and validate a non-admin user before rolling SSO out broadly. Owner and Admin roles are never issued through JIT provisioning."],
];

export default function OidcSsoDocsPage() {
    const title = "Configure OpenID Connect (OIDC) work SSO | EvalcueAI Docs";
    const description = "Configure organization-level OIDC single sign-on for EvalcueAI Hiring using Microsoft Entra ID, Okta, Auth0, Google Workspace, or another OpenID Connect provider.";

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
                    <Typography variant="overline" color="primary.main" fontWeight={850}>Enterprise access</Typography>
                    <Typography component="h1" variant="h2" fontWeight={900} letterSpacing="-.04em">Configure OpenID Connect work SSO</Typography>
                    <Typography variant="h6" color="text.secondary">{description}</Typography>
                </Stack>

                <Alert severity="info" sx={{ mt: 4 }}>Organization SSO is a Hiring Enterprise capability. EvalcueAI uses OIDC Authorization Code flow with PKCE and maps the verified identity into the organization’s existing role and session model.</Alert>
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
                    <li>OIDC issuer and discovered endpoints must use public HTTPS endpoints.</li>
                    <li>State, nonce, and PKCE protect the browser authorization flow.</li>
                    <li>ID tokens are verified for signature, issuer, audience, nonce, and allowed work email domain.</li>
                    <li>Client secrets are encrypted at rest and never returned by the settings API.</li>
                    <li>The browser receives a short-lived, single-use EvalcueAI exchange code rather than an access token in the redirect URL.</li>
                    <li>Disabled or removed organization membership blocks session exchange even after the identity provider has authenticated the user.</li>
                </Stack>
            </Container>
            <SiteFooter />
        </PublicSiteFrame>
    );
}
