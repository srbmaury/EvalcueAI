import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link as RouterLink, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import {
    ArrowForwardRounded,
    AutoAwesomeRounded,
    CheckCircleOutlineRounded,
    SchoolOutlined,
    WorkOutlineRounded,
} from "@mui/icons-material";
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    Container,
    Grid,
    MenuItem,
    Paper,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import api from "../api/axios";
import HiringOrganizationGate from "../components/HiringOrganizationGate";
import SiteFooter from "../components/SiteFooter";
import { AuthContext } from "../context/AuthContext";
import { OrganizationContext } from "../context/OrganizationContext";
import { useNotify } from "../context/NotificationContext";
import { resourcePageFor, resourcePathFor } from "../utils/productResourcePages";
import { writePracticeCreateDraft } from "../utils/practiceCreateDraft";
import { publicSupportEmail } from "../utils/publicContact";
import { setWorkspacePreference } from "../utils/workspacePreference";
import { trackEvent } from "../utils/analytics";
import { describeError } from "../utils/errorFormatter";

const selectedFromSearch = (config, search) => {
    const params = new URLSearchParams(search);
    return config.examples.find((example) => example.id === params.get("example")) || config.examples[0];
};

const hiringActionSearch = (example, role) => {
    const params = new URLSearchParams({ action: "create", example: example.id, role });
    return `?${params.toString()}`;
};

const hiringPayload = (config, example, role) => ({
    title: `${role} — ${example.title}`,
    jobRole: role,
    jobDescription: example.jobDescription,
    followUpsEnabled: true,
    inviteOnly: false,
    candidateInstructions: "Answer clearly, explain your reasoning, and state assumptions and trade-offs. Your responses will be reviewed by the hiring team.",
    contactEmail: publicSupportEmail,
    durationMinutes: example.rounds?.some((round) => round.deliveryMode === "system-design") ? 45 : 30,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    rounds: example.rounds || [],
    rubric: [],
    templateName: config.title,
    status: "draft",
});

export default function ProductResourcePage({ surface }) {
    const { slug } = useParams();
    const config = resourcePageFor(surface, slug);
    const navigate = useNavigate();
    const location = useLocation();
    const notify = useNotify();
    const { user } = useContext(AuthContext);
    const { activeOrganization, loading: organizationLoading } = useContext(OrganizationContext);
    const [role, setRole] = useState(config?.roles?.[0] || "Software Engineer");
    const [selectedId, setSelectedId] = useState(config?.examples?.[0]?.id || "");
    const [creating, setCreating] = useState(false);
    const actionHandled = useRef(false);

    const selected = useMemo(() => config?.examples.find((example) => example.id === selectedId) || config?.examples?.[0], [config, selectedId]);

    useEffect(() => {
        if (!config) return;
        const params = new URLSearchParams(location.search);
        const fromQuery = selectedFromSearch(config, location.search);
        setSelectedId(fromQuery.id);
        const requestedRole = params.get("role");
        if (requestedRole && config.roles.includes(requestedRole)) setRole(requestedRole);
    }, [config, location.search]);

    const createHiringDraft = async (example = selected, targetRole = role) => {
        const actionSearch = hiringActionSearch(example, targetRole);
        if (!user) {
            navigate("/hire/login", {
                state: { from: { pathname: location.pathname, search: actionSearch, hash: "" } },
            });
            return;
        }
        if (!activeOrganization) {
            navigate({ pathname: location.pathname, search: actionSearch }, { replace: true });
            return;
        }
        setCreating(true);
        try {
            const { data } = await api.post("/assessments", hiringPayload(config, example, targetRole));
            trackEvent("seo_resource_assessment_created");
            notify("Draft assessment created from this template.", "success");
            navigate(`/hire/assessments/${data._id}`);
        } catch (error) {
            notify(describeError(error, "Could not create the draft assessment."), "error");
        } finally {
            setCreating(false);
        }
    };

    const startPractice = (example = selected, targetRole = role) => {
        writePracticeCreateDraft({
            formData: {
                company: "",
                jobRole: targetRole,
                jobDescription: example.jobDescription,
                resumeId: "",
            },
            suggestedRounds: [],
            grounding: null,
            selectedRounds: [],
            activeStep: 0,
        });
        setWorkspacePreference("practice", user?._id);
        trackEvent("seo_resource_practice_started");
        navigate("/practice/new");
    };

    useEffect(() => {
        if (!config || config.surface !== "hiring" || actionHandled.current || organizationLoading) return;
        const params = new URLSearchParams(location.search);
        if (params.get("action") !== "create" || !user) return;
        const example = selectedFromSearch(config, location.search);
        const requestedRole = params.get("role");
        const targetRole = requestedRole && config.roles.includes(requestedRole) ? requestedRole : config.roles[0];
        if (!activeOrganization) return;
        actionHandled.current = true;
        createHiringDraft(example, targetRole);
        // createHiringDraft is intentionally invoked once after auth/org restoration.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeOrganization, config, location.search, organizationLoading, user]);

    if (!config) return <Navigate to={surface === "hiring" ? "/hire" : "/practice"} replace />;

    const isHiring = config.surface === "hiring";
    const pendingHiringCreate = isHiring && new URLSearchParams(location.search).get("action") === "create";
    if (pendingHiringCreate && user && !organizationLoading && !activeOrganization) {
        return (
            <Box>
                <HiringOrganizationGate><Box /></HiringOrganizationGate>
                <SiteFooter />
            </Box>
        );
    }

    const ProductIcon = isHiring ? WorkOutlineRounded : SchoolOutlined;
    const primaryAction = isHiring ? () => createHiringDraft() : () => startPractice();
    const related = config.related.map((relatedSlug) => resourcePageFor(config.surface, relatedSlug)).filter(Boolean);

    return (
        <Box component="section" sx={{ overflow: "hidden" }}>
            <Box sx={{ py: { xs: 7, md: 10 }, bgcolor: "action.hover" }}>
                <Container maxWidth="lg">
                    <Grid container spacing={{ xs: 4, md: 7 }} alignItems="center">
                        <Grid size={{ xs: 12, md: 7 }}>
                            <Stack spacing={2.25}>
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <ProductIcon color="primary" />
                                    <Typography variant="overline" color="primary.main" fontWeight={900}>{config.eyebrow}</Typography>
                                </Stack>
                                <Typography component="h1" sx={{ fontSize: { xs: "2.5rem", sm: "3.4rem", md: "4.2rem" }, lineHeight: 1.03, letterSpacing: "-.045em", fontWeight: 850 }}>
                                    {config.title}
                                </Typography>
                                <Typography color="text.secondary" sx={{ fontSize: { xs: "1.05rem", md: "1.18rem" }, lineHeight: 1.7, maxWidth: 760 }}>{config.intro}</Typography>
                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                    <Chip icon={<CheckCircleOutlineRounded />} label={isHiring ? "Creates an editable draft" : "Pre-fills your practice builder"} variant="outlined" />
                                    <Chip icon={<CheckCircleOutlineRounded />} label={isHiring ? "Human review before launch" : "Adaptive interview flow"} variant="outlined" />
                                </Stack>
                            </Stack>
                        </Grid>
                        <Grid size={{ xs: 12, md: 5 }}>
                            <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 4 }}>
                                <Stack spacing={2}>
                                    <Box>
                                        <Typography variant="overline" color="primary.main" fontWeight={850}>Try it now</Typography>
                                        <Typography variant="h5" fontWeight={850}>Choose your target</Typography>
                                    </Box>
                                    <TextField select label={isHiring ? "Role you are hiring for" : "Role you are preparing for"} value={role} onChange={(event) => setRole(event.target.value)}>
                                        {config.roles.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
                                    </TextField>
                                    <TextField select label={isHiring ? "Template" : "Practice track"} value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
                                        {config.examples.map((example) => <MenuItem key={example.id} value={example.id}>{example.title}</MenuItem>)}
                                    </TextField>
                                    <Typography variant="body2" color="text.secondary">{selected.summary}</Typography>
                                    <Button variant="contained" size="large" endIcon={creating ? <CircularProgress size={18} color="inherit" /> : <ArrowForwardRounded />} onClick={primaryAction} disabled={creating}>
                                        {creating ? "Creating draft…" : isHiring ? "Use this in Evalcue AI Hire" : "Practice this in Evalcue AI"}
                                    </Button>
                                </Stack>
                            </Paper>
                        </Grid>
                    </Grid>
                </Container>
            </Box>

            <Container maxWidth="lg" sx={{ py: { xs: 7, md: 9 } }}>
                <Stack spacing={1} mb={4} maxWidth={760}>
                    <Typography variant="overline" color="primary.main" fontWeight={850}>{isHiring ? "Editable templates" : "Practice options"}</Typography>
                    <Typography component="h2" variant="h3" fontWeight={850} letterSpacing="-.04em">Choose a starting point, then make it yours.</Typography>
                    <Typography color="text.secondary" lineHeight={1.7}>{config.description}</Typography>
                </Stack>
                <Grid container spacing={3}>
                    {config.examples.map((example) => (
                        <Grid size={{ xs: 12, md: 4 }} key={example.id}>
                            <Paper variant="outlined" sx={{ p: 3, height: "100%", borderRadius: 4, display: "flex", flexDirection: "column" }}>
                                <AutoAwesomeRounded color="primary" />
                                <Typography variant="h5" fontWeight={850} mt={2}>{example.title}</Typography>
                                <Typography color="text.secondary" lineHeight={1.65} mt={1}>{example.summary}</Typography>
                                <Button sx={{ mt: "auto", pt: 3, alignSelf: "flex-start" }} endIcon={<ArrowForwardRounded />} onClick={() => { setSelectedId(example.id); if (isHiring) createHiringDraft(example, role); else startPractice(example, role); }} disabled={creating}>
                                    {isHiring ? "Create draft" : "Start practice"}
                                </Button>
                            </Paper>
                        </Grid>
                    ))}
                </Grid>
            </Container>

            <Box sx={{ bgcolor: "action.hover", py: { xs: 6, md: 7 } }}>
                <Container maxWidth="lg">
                    <Grid container spacing={4} alignItems="center">
                        <Grid size={{ xs: 12, md: 7 }}>
                            <Typography variant="h4" fontWeight={850}>{isHiring ? "A template should lead to a hiring workflow—not another document." : "A guide is more useful when you can immediately practice it."}</Typography>
                            <Typography color="text.secondary" mt={1.5} lineHeight={1.7}>{isHiring ? "The buttons above create a real organization-owned draft assessment. Your team can edit rounds and questions, preview the candidate experience, then publish when ready." : "The buttons above write your chosen role and topic into the same draft format used by the Practice interview builder, so you continue directly inside the product."}</Typography>
                        </Grid>
                        <Grid size={{ xs: 12, md: 5 }}>
                            <Button variant="contained" size="large" fullWidth onClick={primaryAction} disabled={creating} endIcon={<ArrowForwardRounded />}>
                                {isHiring ? "Build this assessment" : "Start this mock interview"}
                            </Button>
                        </Grid>
                    </Grid>
                </Container>
            </Box>

            <Container maxWidth="lg" sx={{ py: { xs: 7, md: 8 } }}>
                <Typography variant="overline" color="primary.main" fontWeight={850}>Related resources</Typography>
                <Grid container spacing={2} mt={1}>
                    {related.map((page) => (
                        <Grid size={{ xs: 12, md: 4 }} key={page.slug}>
                            <Paper component={RouterLink} to={resourcePathFor(page)} variant="outlined" sx={{ p: 2.5, display: "block", borderRadius: 3, color: "inherit", textDecoration: "none", height: "100%", "&:hover": { borderColor: "primary.main" } }}>
                                <Typography fontWeight={800}>{page.title}</Typography>
                                <Typography variant="body2" color="text.secondary" mt={.75}>{page.description}</Typography>
                            </Paper>
                        </Grid>
                    ))}
                </Grid>
            </Container>

            <SiteFooter />
        </Box>
    );
}
