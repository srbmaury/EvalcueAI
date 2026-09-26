import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link as RouterLink, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import {
    AddRounded,
    AutoAwesomeRounded,
    DeleteOutlineRounded,
    KeyboardArrowLeftRounded,
    KeyboardArrowRightRounded,
} from "@mui/icons-material";
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Checkbox,
    Chip,
    CircularProgress,
    Collapse,
    Container,
    Divider,
    FormControlLabel,
    Grid,
    IconButton,
    MenuItem,
    Paper,
    Stack,
    Step,
    StepLabel,
    Stepper,
    TextField,
    Typography,
} from "@mui/material";
import api from "../api/axios";
import DebuggingRoundEditor, { createDebuggingRound } from "../components/DebuggingRoundEditor";
import JobPostImporter from "../components/JobPostImporter";
import { OrganizationContext } from "../context/OrganizationContext";
import { useNotify } from "../context/NotificationContext";
import { hiringPermissionsFor } from "../utils/hiringPermissions";
import { trackEvent } from "../utils/analytics";
import { describeError } from "../utils/errorFormatter";
import { buildEditableAssessmentPayload, formatLocalDateTimeInput, localDateTimeToIso } from "../utils/hiringAssessmentPayload";
import { parseCandidateInvites } from "../utils/hiringInvites";

const steps = ["Role", "Interview plan", "Questions", "Launch"];
const experienceNames = {
    conversational: "Interview",
    "online-assessment": "Coding / written",
    "system-design": "System design",
    debugging: "Debugging assignment",
};
const emptyRound = (deliveryMode = "conversational") => {
    if (deliveryMode === "debugging") return createDebuggingRound();
    return {
        name: deliveryMode === "system-design" ? "System design" : deliveryMode === "online-assessment" ? "Coding" : "Interview",
        description: "Role-specific knowledge and practical judgment",
        deliveryMode,
        adaptive: deliveryMode === "conversational",
        questionCount: deliveryMode === "system-design" ? 1 : 3,
        aiPrompt: "",
        questions: [],
    };
};

const initialForm = {
    title: "",
    jobRole: "",
    jobDescription: "",
    candidateInstructions: "",
    contactEmail: "",
    durationMinutes: 30,
    opensAt: "",
    expiresAt: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    followUpsEnabled: true,
    askCandidateIntro: true,
    inviteOnly: false,
    inviteEmails: "",
    rubric: [],
    integrity: {
        enabled: false,
        requireFullscreen: false,
        trackFocus: true,
        trackClipboard: true,
        requireCamera: false,
        monitorFacePresence: false,
        retentionDays: 30,
    },
    rounds: [emptyRound()],
};

const starterPresets = {
    engineering: {
        jobRole: "Software Engineer",
        jobDescription: "Build reliable, secure, maintainable software; explain trade-offs; test solutions; and communicate technical decisions clearly.",
        rounds: [emptyRound("conversational")],
    },
    product: {
        jobRole: "Product Manager",
        jobDescription: "Discover customer needs, prioritize outcomes, define success metrics, and align cross-functional teams through ambiguity.",
        rounds: [emptyRound("conversational")],
    },
    sales: {
        jobRole: "Account Executive",
        jobDescription: "Qualify opportunities, uncover customer value, handle objections, and manage a clear and ethical sales process.",
        rounds: [emptyRound("conversational")],
    },
};

const draftKeyFor = (organizationId, editId) => `hiring-assessment-builder:${organizationId || "unknown"}:${editId || "new"}`;
const readLocalDraft = (key) => {
    try { return JSON.parse(window.localStorage?.getItem(key) || "null"); }
    catch { return null; }
};
const writeLocalDraft = (key, value) => {
    try { window.localStorage?.setItem(key, JSON.stringify(value)); }
    catch { /* local recovery is best effort */ }
};
const clearLocalDraft = (key) => {
    try { window.localStorage?.removeItem(key); }
    catch { /* no-op */ }
};
const normalizeLoadedRound = (round) => ({
    ...emptyRound(round.deliveryMode || "conversational"),
    ...round,
    adaptive: round.deliveryMode === "conversational" ? round.adaptive !== false : false,
    questionCount: round.deliveryMode === "system-design" || round.deliveryMode === "debugging" ? 1 : Number(round.questionCount) || round.questions?.length || 3,
    aiPrompt: "",
    questions: (round.questions || []).map((question) => ({ ...question, text: question.text || "", required: Boolean(question.required) })),
});

const debuggingRoundStructurallyReady = (round) => {
    if (round?.deliveryMode !== "debugging") return true;
    const instruction = round.questions?.[0]?.text?.trim();
    const files = Array.isArray(round.debugging?.files) ? round.debugging.files : [];
    const hasSource = files.some((file) => file?.kind === "source" && file?.path?.trim());
    if (!instruction || !hasSource) return false;
    if (round.debugging?.responseMode === "findings") return true;
    return files.some((file) => ["visible_test", "hidden_test"].includes(file?.kind) && file?.path?.trim());
};

export default function AssessmentBuilderPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const editId = searchParams.get("edit") || "";
    const isEditing = Boolean(editId);
    const notify = useNotify();
    const { activeOrganization, currentRole, loading } = useContext(OrganizationContext);
    const permissions = hiringPermissionsFor(currentRole);
    const [activeStep, setActiveStep] = useState(0);
    const [form, setForm] = useState(initialForm);
    const [saving, setSaving] = useState(false);
    const [loadingBuilder, setLoadingBuilder] = useState(isEditing);
    const [error, setError] = useState("");
    const [generatingRound, setGeneratingRound] = useState(null);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [hydrated, setHydrated] = useState(false);
    const [draftSavedAt, setDraftSavedAt] = useState(null);
    const [existingInvitationCount, setExistingInvitationCount] = useState(0);
    const [debuggingAssessmentsEnabled, setDebuggingAssessmentsEnabled] = useState(false);
    // Runtimes the deployment's code runner supports (server-configured); empty means use the built-in list.
    const [debuggingRuntimes, setDebuggingRuntimes] = useState([]);
    const [debuggingValidations, setDebuggingValidations] = useState({});
    const hydrationKeyRef = useRef("");

    const draftKey = useMemo(() => draftKeyFor(activeOrganization?._id, editId), [activeOrganization?._id, editId]);

    useEffect(() => {
        let active = true;
        if (!activeOrganization?._id) {
            setDebuggingAssessmentsEnabled(false);
            return () => { active = false; };
        }
        api.get("/assessments/capabilities")
            .then(({ data }) => {
                if (!active) return;
                setDebuggingAssessmentsEnabled(Boolean(data?.debuggingAssessments));
                setDebuggingRuntimes(Array.isArray(data?.debuggingRuntimes) ? data.debuggingRuntimes : []);
            })
            .catch(() => {
                if (active) setDebuggingAssessmentsEnabled(false);
            });
        return () => { active = false; };
    }, [activeOrganization?._id]);

    useEffect(() => {
        if (!activeOrganization?._id) return;
        const hydrationKey = `${activeOrganization._id}:${editId || "new"}`;
        if (hydrationKeyRef.current === hydrationKey) return;
        hydrationKeyRef.current = hydrationKey;

        const hydrate = async () => {
            setLoadingBuilder(isEditing);
            setHydrated(false);
            setError("");
            setDebuggingValidations({});
            try {
                if (isEditing) {
                    const { data } = await api.get(`/assessments/${editId}`);
                    // hydrationKeyRef (not a per-invocation closure flag) is the source of
                    // truth for whether this hydration is still current: it's shared across
                    // React StrictMode's dev-only double-invoke of this effect, so unlike a
                    // local `let active = true` severed by a synthetic remount's cleanup, it
                    // only actually changes when the org/editId genuinely changes later.
                    if (hydrationKeyRef.current !== hydrationKey) return;
                    const assessment = data?.assessment;
                    if (!assessment || assessment.status !== "draft" || data?.attempts?.length) {
                        notify("Only unused drafts can be edited. Create a new version instead.", "warning");
                        navigate(`/hire/assessments/${editId}`, { replace: true });
                        return;
                    }
                    setExistingInvitationCount((assessment.invitations || []).filter((item) => item.status !== "revoked").length);
                    const timezone = assessment.timezone || initialForm.timezone;
                    const serverForm = {
                        ...initialForm,
                        ...assessment,
                        timezone,
                        opensAt: formatLocalDateTimeInput(assessment.opensAt, timezone),
                        expiresAt: formatLocalDateTimeInput(assessment.expiresAt, timezone),
                        inviteEmails: "",
                        rounds: (assessment.rounds || []).map(normalizeLoadedRound),
                    };
                    const local = readLocalDraft(draftKey);
                    const localIsNewer = local?.savedAt && new Date(local.savedAt).getTime() > new Date(assessment.updatedAt || 0).getTime();
                    setForm(localIsNewer && local?.form ? local.form : serverForm);
                    setActiveStep(localIsNewer ? Math.max(0, Math.min(3, Number(local.activeStep) || 0)) : 0);
                    if (localIsNewer) {
                        setDraftSavedAt(local.savedAt);
                        // Restored alongside form/rounds from the same saved snapshot, so the
                        // indices still line up. Without this, a debugging round validated
                        // before a reload showed the "validate before publishing" warning
                        // again even though its config hadn't changed, forcing a re-validate.
                        setDebuggingValidations(local.debuggingValidations || {});
                        notify("Recovered unsaved draft changes from this device.", "info");
                    }
                } else {
                    const local = readLocalDraft(draftKey);
                    if (local?.form) {
                        setForm({ ...initialForm, ...local.form });
                        setActiveStep(Math.max(0, Math.min(3, Number(local.activeStep) || 0)));
                        setDraftSavedAt(local.savedAt || null);
                        setDebuggingValidations(local.debuggingValidations || {});
                    } else {
                        setForm(initialForm);
                        setActiveStep(0);
                        setDraftSavedAt(null);
                    }
                }
            } catch (err) {
                if (hydrationKeyRef.current !== hydrationKey) return;
                setError(describeError(err, "The assessment draft could not be loaded."));
            } finally {
                if (hydrationKeyRef.current === hydrationKey) {
                    setLoadingBuilder(false);
                    setHydrated(true);
                }
            }
        };
        hydrate();
    }, [activeOrganization?._id, draftKey, editId, isEditing, navigate, notify]);

    useEffect(() => {
        if (!hydrated || !activeOrganization?._id) return;
        const timer = window.setTimeout(() => {
            const savedAt = new Date().toISOString();
            writeLocalDraft(draftKey, { form, activeStep, savedAt, debuggingValidations });
            setDraftSavedAt(savedAt);
        }, 300);
        return () => window.clearTimeout(timer);
    }, [activeOrganization?._id, activeStep, debuggingValidations, draftKey, form, hydrated]);

    const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
    const updateRound = (index, patch) => setForm((current) => ({
        ...current,
        rounds: current.rounds.map((round, position) => position === index ? { ...round, ...patch } : round),
    }));
    const replaceRound = (index, nextRound) => setForm((current) => ({
        ...current,
        rounds: current.rounds.map((round, position) => position === index ? nextRound : round),
    }));
    const setDebuggingValidation = (index, value) => setDebuggingValidations((current) => ({ ...current, [index]: value }));

    const applyStarter = (kind) => {
        const starter = starterPresets[kind];
        setDebuggingValidations({});
        setForm((current) => ({
            ...current,
            ...starter,
            title: `${starter.jobRole} Assessment`,
        }));
    };

    const stepValid = useMemo(() => {
        if (activeStep === 0) return Boolean(form.jobRole.trim() && form.title.trim() && form.jobDescription.trim().length >= 20);
        if (activeStep === 1) return form.rounds.length > 0 && form.rounds.every((round) => round.name.trim() && round.description.trim());
        if (activeStep === 2) return form.rounds.every((round) => round.deliveryMode === "debugging"
            ? debuggingRoundStructurallyReady(round)
            : round.questions.some((question) => question.text?.trim()));
        return true;
    }, [activeStep, form]);

    const debuggingReadyToPublish = useMemo(() => form.rounds.every((round, index) =>
        round.deliveryMode !== "debugging" || debuggingValidations[index]?.valid === true), [debuggingValidations, form.rounds]);

    const generateQuestions = async (roundIndex) => {
        const round = form.rounds[roundIndex];
        if (round.deliveryMode === "debugging") return;
        if (!form.jobRole.trim() || form.jobDescription.trim().length < 20) {
            setError("Finish the role step before generating questions.");
            return;
        }
        setGeneratingRound(roundIndex);
        setError("");
        try {
            const { data } = await api.post("/assessments/questions/generate", {
                jobRole: form.jobRole,
                jobDescription: form.jobDescription,
                roundName: round.name,
                roundDescription: round.description,
                deliveryMode: round.deliveryMode,
                prompt: round.aiPrompt || `Generate ${round.questionCount} strong ${experienceNames[round.deliveryMode]} questions for this role.`,
                count: Math.max(1, Math.min(10, Number(round.questionCount) || 3)),
                existingQuestions: round.questions.filter((question) => question.text?.trim()).map((question) => question.text),
            });
            const generated = (data.questions || []).map((question) => ({
                ...question,
                text: question.text || "",
                required: Boolean(question.required),
            }));
            updateRound(roundIndex, { questions: generated.length ? generated : round.questions });
        } catch (err) {
            setError(describeError(err, "AI couldn’t generate questions right now. Add them manually or try again."));
        } finally {
            setGeneratingRound(null);
        }
    };

    const addQuestion = (roundIndex) => {
        const round = form.rounds[roundIndex];
        updateRound(roundIndex, { questions: [...round.questions, { text: "", required: true }] });
    };

    const updateQuestion = (roundIndex, questionIndex, patch) => {
        const round = form.rounds[roundIndex];
        updateRound(roundIndex, {
            questions: round.questions.map((question, index) => index === questionIndex ? { ...question, ...patch } : question),
        });
    };

    const removeQuestion = (roundIndex, questionIndex) => {
        const round = form.rounds[roundIndex];
        updateRound(roundIndex, { questions: round.questions.filter((_, index) => index !== questionIndex) });
    };

    const save = async (intent) => {
        if (!permissions.canManageAssessments) return;
        const publishNow = intent === "publish";
        const schedule = intent === "schedule";
        if ((publishNow || schedule) && !debuggingReadyToPublish) {
            setError("Validate every debugging assignment before publishing or scheduling.");
            setActiveStep(2);
            return;
        }
        const rounds = form.rounds.map((round) => ({
            ...round,
            questions: round.questions
                .map((question) => ({
                    text: question.text.trim(),
                    required: Boolean(question.required),
                    weight: Number(question.weight) || 1,
                    competencies: question.competencies || [],
                    knockout: Boolean(question.knockout),
                }))
                .filter((question) => question.text),
        }));
        if (rounds.some((round) => !round.questions.length)) {
            setError("Add at least one question to every interview round before saving to the workspace. Your in-progress builder is already recovered automatically on this device.");
            setActiveStep(2);
            return;
        }
        const opensAtIso = localDateTimeToIso(form.opensAt, form.timezone);
        if (schedule && (!opensAtIso || new Date(opensAtIso) <= new Date())) {
            setError("Choose a future opening time before scheduling.");
            return;
        }
        const candidates = parseCandidateInvites(form.inviteEmails);
        if ((publishNow || schedule) && form.inviteOnly && !candidates.length && existingInvitationCount === 0) {
            setError("Add at least one candidate email for an invite-only assessment.");
            return;
        }
        setSaving(true);
        setError("");
        try {
            const status = publishNow ? "active" : schedule ? "scheduled" : "draft";
            const payload = buildEditableAssessmentPayload(form, { rounds });

            let savedAssessment;
            if (isEditing) {
                const { data: updated } = await api.patch(`/assessments/${editId}`, payload);
                savedAssessment = updated;
                if (status !== "draft") {
                    const { data: transitioned } = await api.patch(`/assessments/${editId}`, { status });
                    savedAssessment = transitioned;
                }
            } else {
                const { data: created } = await api.post("/assessments", { ...payload, status });
                savedAssessment = created;
            }

            if ((publishNow || schedule) && candidates.length) {
                await api.post(`/assessments/${savedAssessment._id}/invitations`, { candidates });
            }
            clearLocalDraft(draftKey);
            trackEvent(publishNow ? "assessment_published" : schedule ? "assessment_scheduled" : "assessment_draft_saved");
            notify(publishNow ? "Assessment published." : schedule ? "Assessment scheduled." : isEditing ? "Draft updated." : "Draft saved.", "success");
            navigate(`/hire/assessments/${savedAssessment._id}`);
        } catch (err) {
            setError(describeError(err, "The assessment couldn’t be saved. Check the details and try again."));
        } finally {
            setSaving(false);
        }
    };

    const discardLocalChanges = () => {
        clearLocalDraft(draftKey);
        setDebuggingValidations({});
        if (isEditing) {
            navigate(`/hire/assessments/${editId}`);
            return;
        }
        setForm(initialForm);
        setActiveStep(0);
        setDraftSavedAt(null);
    };

    if (loading || loadingBuilder) return <Stack minHeight="50vh" alignItems="center" justifyContent="center"><CircularProgress /></Stack>;
    if (!activeOrganization) return <Navigate to="/hire/team" replace />;
    if (!permissions.canManageAssessments) return <Navigate to="/hire/assessments" replace />;

    return (
        <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
            <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={2} mb={3}>
                <Box>
                    <Button component={RouterLink} to="/hire/assessments#assessment-list" startIcon={<KeyboardArrowLeftRounded />} color="inherit" sx={{ mb: 1 }}>Back to assessments</Button>
                    <Typography component="h1" variant="h3" sx={{ fontSize: { xs: "2.2rem", sm: "2.8rem" } }} fontWeight={850}>{isEditing ? "Edit assessment draft" : "Create an assessment"}</Typography>
                    <Typography color="text.secondary" mt={1}>{isEditing ? "Use the same guided flow as creation. Changes stay private until you publish." : "Make one decision at a time. You can review everything before candidates see it."}</Typography>
                </Box>
                <Stack spacing={1} alignItems={{ md: "flex-end" }}>
                    <Chip label={`${isEditing ? "Editing" : "Creating"} for ${activeOrganization.name}`} variant="outlined" />
                    {draftSavedAt && <Typography variant="caption" color="text.secondary">Recovered locally · saved {new Date(draftSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Typography>}
                </Stack>
            </Stack>

            <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, mb: 3, overflowX: "auto" }}>
                <Stepper activeStep={activeStep} alternativeLabel sx={{ minWidth: 520 }}>
                    {steps.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
                </Stepper>
            </Paper>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 8 }}>
                    <Paper variant="outlined" sx={{ p: { xs: 2.25, sm: 3 }, borderRadius: 3 }}>
                        {activeStep === 0 && <Stack spacing={2.25}>
                            <Box><Typography variant="overline" color="primary.main" fontWeight={850}>Step 1 of 4</Typography><Typography variant="h5" fontWeight={850}>What are you hiring for?</Typography><Typography color="text.secondary" variant="body2" mt={.5}>A clear role definition gives the question generator and reviewers the right context.</Typography></Box>
                            <Stack direction="row" gap={1} flexWrap="wrap"><Button size="small" variant="outlined" onClick={() => applyStarter("engineering")}>Engineering starter</Button><Button size="small" variant="outlined" onClick={() => applyStarter("product")}>Product starter</Button><Button size="small" variant="outlined" onClick={() => applyStarter("sales")}>Sales starter</Button></Stack>
                            <JobPostImporter onImport={({ jobRole, jobDescription }) => setForm((current) => ({ ...current, jobRole, jobDescription, title: `${jobRole} Assessment` }))} />
                            <TextField required fullWidth label="Job role" value={form.jobRole} onChange={(event) => {
                                const nextRole = event.target.value;
                                setForm((current) => {
                                  const autoTitle = `${nextRole} Assessment`;
                                  const titleWasAutoGenerated = current.title === `${current.jobRole} Assessment`;
                                  return {
                                    ...current,
                                    jobRole: nextRole,
                                    title: titleWasAutoGenerated || !current.title ? autoTitle : current.title,
                                  };
                                });
                              }} />
                            <TextField required fullWidth label="Assessment name" helperText="Candidates will see this name." value={form.title} onChange={(event) => setField("title", event.target.value)} />
                            <TextField required multiline minRows={5} label="Job description and success criteria" helperText="Responsibilities, seniority, must-have skills, and what strong performance looks like." value={form.jobDescription} onChange={(event) => setField("jobDescription", event.target.value)} inputProps={{ minLength: 20 }} />
                        </Stack>}

                        {activeStep === 1 && <Stack spacing={2.25}>
                            <Box><Typography variant="overline" color="primary.main" fontWeight={850}>Step 2 of 4</Typography><Typography variant="h5" fontWeight={850}>Choose the candidate experience</Typography><Typography color="text.secondary" variant="body2" mt={.5}>Start simple. Add another round only when it measures something meaningfully different.</Typography></Box>
                            {form.rounds.map((round, index) => <Card variant="outlined" key={index}><CardContent><Stack spacing={2}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography fontWeight={850}>Round {index + 1}</Typography><Typography variant="body2" color="text.secondary">{experienceNames[round.deliveryMode]}</Typography></Box>{form.rounds.length > 1 && <IconButton aria-label={`Remove round ${index + 1}`} onClick={() => { setDebuggingValidations({}); setField("rounds", form.rounds.filter((_, position) => position !== index)); }}><DeleteOutlineRounded /></IconButton>}</Stack>
                                <TextField select label="Format" value={round.deliveryMode} onChange={(event) => {
                                    const deliveryMode = event.target.value;
                                    setDebuggingValidation(index, null);
                                    if (deliveryMode === "debugging") {
                                        replaceRound(index, createDebuggingRound((debuggingRuntimes.find((item) => item.executable) || debuggingRuntimes[0])?.runtime));
                                        return;
                                    }
                                    const rest = { ...round };
                                    delete rest.debugging;
                                    replaceRound(index, {
                                        ...rest,
                                        deliveryMode,
                                        name: deliveryMode === "system-design" ? "System design" : deliveryMode === "online-assessment" ? "Coding" : "Interview",
                                        adaptive: deliveryMode === "conversational",
                                        questionCount: deliveryMode === "system-design" ? 1 : Math.max(Number(round.questionCount) || 3, 1),
                                    });
                                }}><MenuItem value="conversational">Conversational interview</MenuItem><MenuItem value="online-assessment">Coding / written assessment</MenuItem><MenuItem value="system-design">System design</MenuItem>{debuggingAssessmentsEnabled && <MenuItem value="debugging">Debugging assignment</MenuItem>}</TextField>
                                <TextField label="Round name" value={round.name} onChange={(event) => updateRound(index, { name: event.target.value })} />
                                <TextField multiline minRows={2} label="What should this round evaluate?" value={round.description} onChange={(event) => updateRound(index, { description: event.target.value })} />
                                {round.deliveryMode !== "system-design" && round.deliveryMode !== "debugging" && <TextField type="number" label={round.adaptive ? "Maximum primary questions" : "Question count"} value={round.questionCount} onChange={(event) => updateRound(index, { questionCount: Math.max(1, Math.min(10, Number(event.target.value) || 1)) })} inputProps={{ min: 1, max: 10 }} />}
                                {round.deliveryMode === "conversational" && <FormControlLabel control={<Checkbox checked={round.adaptive !== false} onChange={(event) => updateRound(index, { adaptive: event.target.checked })} />} label="Let AI adapt the remaining primary questions to the candidate" />}
                            </Stack></CardContent></Card>)}
                            <Button startIcon={<AddRounded />} variant="outlined" onClick={() => { setDebuggingValidations({}); setField("rounds", [...form.rounds, emptyRound()]); }}>Add another round</Button>
                        </Stack>}

                        {activeStep === 2 && <Stack spacing={2.5}>
                            <Box><Typography variant="overline" color="primary.main" fontWeight={850}>Step 3 of 4</Typography><Typography variant="h5" fontWeight={850}>Define the evidence you need</Typography><Typography color="text.secondary" variant="body2" mt={.5}>Generate a starting set, then keep only questions you would actually use to make a hiring decision.</Typography></Box>
                            {form.rounds.map((round, roundIndex) => <Card variant="outlined" key={roundIndex}><CardContent>
                                {round.deliveryMode === "debugging" ? (
                                    <DebuggingRoundEditor runtimes={debuggingRuntimes} round={round} onChange={(nextRound) => replaceRound(roundIndex, nextRound)} validation={debuggingValidations[roundIndex]} onValidationChange={(value) => setDebuggingValidation(roundIndex, value)} />
                                ) : (
                                    <Stack spacing={2}>
                                        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1}><Box><Typography fontWeight={850}>{round.name}</Typography><Typography variant="body2" color="text.secondary">{experienceNames[round.deliveryMode]} · target {round.questionCount} question{Number(round.questionCount) === 1 ? "" : "s"}</Typography></Box><Button startIcon={generatingRound === roundIndex ? <CircularProgress size={18} /> : <AutoAwesomeRounded />} variant="outlined" disabled={generatingRound !== null} onClick={() => generateQuestions(roundIndex)}>{generatingRound === roundIndex ? "Generating…" : "Generate with AI"}</Button></Stack>
                                        <TextField multiline minRows={2} label="Optional AI brief" placeholder="Focus on debugging, API design, trade-offs, and seniority-appropriate judgment." value={round.aiPrompt} onChange={(event) => updateRound(roundIndex, { aiPrompt: event.target.value })} />
                                        <Divider />
                                        {round.questions.map((question, questionIndex) => <Stack key={questionIndex} direction={{ xs: "column", sm: "row" }} gap={1} alignItems={{ sm: "flex-start" }}><TextField fullWidth multiline minRows={2} label={`Question ${questionIndex + 1}`} value={question.text} onChange={(event) => updateQuestion(roundIndex, questionIndex, { text: event.target.value })} /><FormControlLabel control={<Checkbox checked={Boolean(question.required)} onChange={(event) => updateQuestion(roundIndex, questionIndex, { required: event.target.checked })} />} label="Must ask" /><IconButton aria-label={`Remove question ${questionIndex + 1}`} onClick={() => removeQuestion(roundIndex, questionIndex)}><DeleteOutlineRounded /></IconButton></Stack>)}
                                        <Button size="small" startIcon={<AddRounded />} onClick={() => addQuestion(roundIndex)}>Add question</Button>
                                    </Stack>
                                )}
                            </CardContent></Card>)}
                        </Stack>}

                        {activeStep === 3 && <Stack spacing={2.25}>
                            <Box><Typography variant="overline" color="primary.main" fontWeight={850}>Step 4 of 4</Typography><Typography variant="h5" fontWeight={850}>Review and launch</Typography><Typography color="text.secondary" variant="body2" mt={.5}>Candidate-facing details first. Security, scheduling, and invitations stay optional until you need them.</Typography></Box>
                            {!debuggingReadyToPublish && <Alert severity="warning">Validate every debugging assignment before publishing or scheduling. Draft saving remains available.</Alert>}
                            <TextField multiline minRows={3} label="Candidate instructions" helperText="What should candidates know before they begin?" value={form.candidateInstructions} onChange={(event) => setField("candidateInstructions", event.target.value)} />
                            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}><TextField fullWidth type="email" label="Support email" value={form.contactEmail} onChange={(event) => setField("contactEmail", event.target.value)} /><TextField fullWidth type="number" label="Estimated duration (minutes)" value={form.durationMinutes} onChange={(event) => setField("durationMinutes", Number(event.target.value) || 30)} inputProps={{ min: 5, max: 240 }} /></Stack>
                            <FormControlLabel control={<Checkbox checked={form.followUpsEnabled} onChange={(event) => setField("followUpsEnabled", event.target.checked)} />} label="Allow contextual AI follow-up questions" />
                            <FormControlLabel control={<Checkbox checked={form.askCandidateIntro !== false} onChange={(event) => setField("askCandidateIntro", event.target.checked)} />} label="Ask candidates for a short, unscored introduction before round 1 (helps the AI ask about their real experience)" />
                            <FormControlLabel control={<Checkbox checked={form.inviteOnly} onChange={(event) => setField("inviteOnly", event.target.checked)} />} label="Only invited candidates can access this assessment" />
                            {form.inviteOnly && <TextField multiline minRows={3} label="Candidate emails" placeholder="candidate@example.com" helperText={existingInvitationCount ? `${existingInvitationCount} existing invitation${existingInvitationCount === 1 ? "" : "s"} will remain. Add only new candidates here.` : "One per line, or separate with commas."} value={form.inviteEmails} onChange={(event) => setField("inviteEmails", event.target.value)} />}
                            <Button variant="text" sx={{ alignSelf: "flex-start" }} onClick={() => setShowAdvanced((current) => !current)}>{showAdvanced ? "Hide advanced launch settings" : "Show scheduling and integrity settings"}</Button>
                            <Collapse in={showAdvanced}><Paper variant="outlined" sx={{ p: 2 }}><Stack spacing={2}>
                                <Typography variant="caption" color="text.secondary">Scheduling uses {form.timezone}. Times are stored as UTC and shown to recruiters in this assessment timezone.</Typography>
                                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}><TextField fullWidth type="datetime-local" label={`Opens at (${form.timezone})`} value={form.opensAt} onChange={(event) => setField("opensAt", event.target.value)} InputLabelProps={{ shrink: true }} /><TextField fullWidth type="datetime-local" label={`Submission deadline (${form.timezone})`} value={form.expiresAt} onChange={(event) => setField("expiresAt", event.target.value)} InputLabelProps={{ shrink: true }} /></Stack>
                                <FormControlLabel control={<Checkbox checked={form.integrity.enabled} onChange={(event) => setField("integrity", { ...form.integrity, enabled: event.target.checked })} />} label="Enable integrity monitoring" />
                                {form.integrity.enabled && <Stack pl={2}><FormControlLabel control={<Checkbox checked={form.integrity.requireFullscreen} onChange={(event) => setField("integrity", { ...form.integrity, requireFullscreen: event.target.checked })} />} label="Require fullscreen" /><FormControlLabel control={<Checkbox checked={form.integrity.requireCamera} onChange={(event) => setField("integrity", { ...form.integrity, requireCamera: event.target.checked })} />} label="Require camera" /></Stack>}
                            </Stack></Paper></Collapse>
                            <Alert severity="info">Your in-progress builder is recovered automatically on this device. Saving a draft stores the reviewed assessment in the hiring workspace; publishing enables candidate access.</Alert>
                        </Stack>}

                        <Divider sx={{ my: 3 }} />
                        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={1}>
                            <Stack direction="row" gap={1}>
                                <Button disabled={activeStep === 0 || saving} startIcon={<KeyboardArrowLeftRounded />} onClick={() => { setError(""); setActiveStep((step) => Math.max(0, step - 1)); }}>Back</Button>
                                <Button color="inherit" disabled={saving} onClick={discardLocalChanges}>Discard local changes</Button>
                            </Stack>
                            {activeStep < steps.length - 1 ? <Button variant="contained" disabled={!stepValid} endIcon={<KeyboardArrowRightRounded />} onClick={() => { setError(""); setActiveStep((step) => Math.min(steps.length - 1, step + 1)); }}>Continue</Button> : <Stack direction="row" gap={1} flexWrap="wrap" justifyContent="flex-end"><Button variant="outlined" disabled={saving} onClick={() => save("draft")}>{isEditing ? "Save draft changes" : "Save draft"}</Button>{form.opensAt && <Button variant="outlined" disabled={saving || !debuggingReadyToPublish} onClick={() => save("schedule")}>Schedule</Button>}<Button variant="contained" disabled={saving || !debuggingReadyToPublish} onClick={() => save("publish")}>{saving ? <CircularProgress size={20} color="inherit" /> : "Publish assessment"}</Button></Stack>}
                        </Stack>
                    </Paper>
                </Grid>

                <Grid size={{ xs: 12, md: 4 }}>
                    <Paper variant="outlined" sx={{ p: 2.25, borderRadius: 3, position: { md: "sticky" }, top: { md: 96 } }}>
                        <Typography variant="overline" color="primary.main" fontWeight={850}>Assessment summary</Typography>
                        <Typography variant="h6" fontWeight={850} mt={.5}>{form.title || "Untitled assessment"}</Typography>
                        <Typography variant="body2" color="text.secondary">{form.jobRole || "Add a role to get started"}</Typography>
                        <Divider sx={{ my: 2 }} />
                        <Stack spacing={1.5}>{form.rounds.map((round, index) => <Box key={index}><Typography fontWeight={750}>{index + 1}. {round.name}</Typography><Typography variant="caption" color="text.secondary">{experienceNames[round.deliveryMode]} · {round.questions.filter((question) => question.text?.trim()).length} reviewed question{round.questions.filter((question) => question.text?.trim()).length === 1 ? "" : "s"}</Typography></Box>)}</Stack>
                        <Divider sx={{ my: 2 }} />
                        <Stack direction="row" gap={1} flexWrap="wrap"><Chip size="small" label={`${form.durationMinutes || 30} min`} /><Chip size="small" label={form.inviteOnly ? "Invite only" : "Shareable link"} /><Chip size="small" label={form.followUpsEnabled ? "AI follow-ups on" : "AI follow-ups off"} /></Stack>
                    </Paper>
                </Grid>
            </Grid>
        </Container>
    );
}
