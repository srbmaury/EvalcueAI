import PublicSiteFrame from "../components/PublicSiteFrame";
import { Box, Card, CardActionArea, CardContent, Chip, Container, Divider, Stack, Typography } from "@mui/material";
import { Link as RouterLink, useLocation } from "react-router-dom";
import Seo from "../components/Seo";
import SiteFooter from "../components/SiteFooter";
import { DOCS_ARTICLES as articles, DOCS_CARDS as cards } from "../utils/publicPageContent";

export default function PublicDocsPage() {
    const { pathname } = useLocation();
    const article = articles[pathname];

    if (!article) {
        const title = "EvalcueAI Documentation | Technical interviews and hiring";
        const description = "Practical documentation for structured technical assessments, system design interviews, candidate scorecards, AI interview practice, enterprise SSO, and responsible human review.";
        return (
            <PublicSiteFrame>
                <Container maxWidth="lg" sx={{ py: { xs: 5, md: 9 } }}>
                    <Seo title={title} description={description} canonicalPath="/docs" structuredData={{ "@context": "https://schema.org", "@type": "CollectionPage", name: "EvalcueAI Documentation", description }} />
                    <Stack spacing={2} maxWidth={780}>
                        <Chip label="Documentation" color="primary" variant="outlined" sx={{ alignSelf: "flex-start" }} />
                        <Typography component="h1" variant="h2" fontWeight={900} letterSpacing="-.04em">Guides and documentation.</Typography>
                        <Typography variant="h6" color="text.secondary">Guides for engineering teams designing assessments and candidates preparing for technical interviews.</Typography>
                    </Stack>
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" }, gap: 2, mt: 5 }}>
                        {cards.map(([name, path, summary]) => (
                            <Card key={path} variant="outlined" sx={{ borderRadius: 1, border: 0, borderTop: "1px solid", borderColor: "divider" }}>
                                <CardActionArea component={RouterLink} to={path} sx={{ height: "100%" }}>
                                    <CardContent sx={{ p: 3 }}>
                                        <Typography component="h2" variant="h5" fontWeight={800}>{name}</Typography>
                                        <Typography color="text.secondary" mt={1}>{summary}</Typography>
                                    </CardContent>
                                </CardActionArea>
                            </Card>
                        ))}
                    </Box>
                </Container>
                <SiteFooter />
            </PublicSiteFrame>
        );
    }

    const canonicalPath = pathname;
    const title = `${article.title} | EvalcueAI Docs`;
    return (
        <PublicSiteFrame>
            <Container maxWidth="md" sx={{ py: { xs: 5, md: 9 } }}>
                <Seo title={title} description={article.description} canonicalPath={canonicalPath} structuredData={{ "@context": "https://schema.org", "@type": "Article", headline: article.title, description: article.description, author: { "@type": "Organization", name: "EvalcueAI" }, publisher: { "@type": "Organization", name: "EvalcueAI" }, mainEntityOfPage: `${window.location.origin}${canonicalPath}` }} />
                <Stack spacing={2}>
                    <Typography component={RouterLink} to="/docs" color="primary.main" sx={{ textDecoration: "none", fontWeight: 800 }}>← Documentation</Typography>
                    <Typography variant="overline" color="primary.main" fontWeight={850}>{article.eyebrow}</Typography>
                    <Typography component="h1" variant="h2" fontWeight={900} letterSpacing="-.04em">{article.title}</Typography>
                    <Typography variant="h6" color="text.secondary">{article.description}</Typography>
                </Stack>
                <Divider sx={{ my: 5 }} />
                <Stack spacing={5}>
                    {article.sections.map(([heading, body]) => (
                        <Box component="section" key={heading}>
                            <Typography component="h2" variant="h4" fontWeight={850}>{heading}</Typography>
                            <Typography sx={{ mt: 1.5, fontSize: "1.08rem", lineHeight: 1.8 }} color="text.secondary">{body}</Typography>
                        </Box>
                    ))}
                </Stack>
                <Divider sx={{ my: 5 }} />
                <Typography component={RouterLink} to="/docs" color="primary.main" sx={{ textDecoration: "none", fontWeight: 800 }}>Browse all EvalcueAI documentation →</Typography>
            </Container>
            <SiteFooter />
        </PublicSiteFrame>
    );
}
