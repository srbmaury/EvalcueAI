import fs from "node:fs";

const changed = [];

const read = (path) => fs.readFileSync(path, "utf8");
const write = (path, content) => fs.writeFileSync(path, content);

const replaceOnce = (path, needle, replacement, label) => {
  const source = read(path);
  if (!source.includes(needle)) {
    console.log(`[skip] ${label}`);
    return false;
  }
  const next = source.replace(needle, replacement);
  if (next !== source) {
    write(path, next);
    changed.push(label);
  }
  return true;
};

const replaceRegex = (path, regex, replacement, label) => {
  const source = read(path);
  if (!regex.test(source)) {
    console.log(`[skip] ${label}`);
    return false;
  }
  const next = source.replace(regex, replacement);
  if (next !== source) {
    write(path, next);
    changed.push(label);
  }
  return true;
};

const authController = "server/src/controllers/authController.js";
replaceOnce(
  authController,
  'import { practiceClientOrigin } from "../config/clientOrigins.js";',
  'import { hiringClientOrigin, practiceClientOrigin } from "../config/clientOrigins.js";',
  "auth reset origin imports",
);
replaceOnce(
  authController,
  'const safeUserFields = "_id name email role provider preferredProgrammingLanguage practiceGoal targetRole weeklyPracticeTarget reminderEnabled reminderDay reminderTime reminderTimezone practicePlan practiceSubscriptionStatus isVerified";\n',
  'const safeUserFields = "_id name email role provider preferredProgrammingLanguage practiceGoal targetRole weeklyPracticeTarget reminderEnabled reminderDay reminderTime reminderTimezone practicePlan practiceSubscriptionStatus isVerified";\nconst resetWorkspaceFor = (value) => value === "hiring" ? "hiring" : "practice";\nconst clientOriginForWorkspace = (workspace) => resetWorkspaceFor(workspace) === "hiring" ? hiringClientOrigin() : practiceClientOrigin();\n',
  "auth reset workspace helpers",
);
replaceOnce(
  authController,
  'export const forgotPassword = async (req, res, next) => {\n    const { email } = req.body;',
  'export const forgotPassword = async (req, res, next) => {\n    const { email, workspace } = req.body;',
  "auth forgot workspace body",
);
replaceOnce(
  authController,
  '        const baseUrl = practiceClientOrigin();\n        const resetUrl = `${baseUrl}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;',
  '        const resetWorkspace = resetWorkspaceFor(workspace);\n        const baseUrl = clientOriginForWorkspace(resetWorkspace);\n        const resetUrl = `${baseUrl}/reset-password?token=${token}&email=${encodeURIComponent(email)}&workspace=${resetWorkspace}`;',
  "auth forgot workspace reset url",
);
replaceOnce(
  authController,
  'export const resetPassword = async (req, res, next) => {\n    const { token, email, newPassword } = req.body;',
  'export const resetPassword = async (req, res, next) => {\n    const { token, email, newPassword, workspace } = req.body;\n    const resetWorkspace = resetWorkspaceFor(workspace);',
  "auth reset workspace body",
);
replaceOnce(
  authController,
  '        return res.json({ message: "Password has been reset" });',
  '        return res.json({ message: "Password has been reset", workspace: resetWorkspace });',
  "auth reset returns workspace",
);

const loginPage = "client/src/pages/LoginPage.jsx";
replaceOnce(
  loginPage,
  '    const registerPath = productRegisterPath(requestedWorkspace);\n',
  '    const registerPath = productRegisterPath(requestedWorkspace);\n    const forgotPasswordPath = `/forgot-password?workspace=${requestedWorkspace || getWorkspacePreference() || "practice"}`;\n',
  "login forgot workspace path",
);
replaceOnce(
  loginPage,
  '<Link component={RouterLink} to="/forgot-password" underline="hover">Forgot password?</Link>',
  '<Link component={RouterLink} to={forgotPasswordPath} underline="hover">Forgot password?</Link>',
  "login forgot workspace link",
);

const createInterview = "client/src/pages/CreateInterviewPage.jsx";
replaceOnce(
  createInterview,
  '            notify("Resume upload failed.", "error");',
  '            notify(err?.response?.data?.message || err?.message || "Resume upload failed.", "error");',
  "create interview upload error detail",
);

const dashboardPage = "client/src/pages/DashboardPage.jsx";
replaceOnce(
  dashboardPage,
  '        api.get("/resumes", { params: { page: 1, limit: 1 } }).then(({ data }) => setResumeCount(Array.isArray(data) ? data.length : Number(data?.total) || 0)).catch(() => {});\n    }, [user]);\n\n    useEffect(() => {\n',
  '        api.get("/resumes", { params: { page: 1, limit: 1 } }).then(({ data }) => setResumeCount(Array.isArray(data) ? data.length : Number(data?.total) || 0)).catch(() => {});\n    }, [user]);\n\n    useEffect(() => { setPage(1); }, [statusFilter]);\n\n    useEffect(() => {\n',
  "dashboard reset page on filter",
);
replaceOnce(
  dashboardPage,
  '                const { data } = await api.get(`/interviews`, { params: { page, limit } });',
  '                const params = { page, limit };\n                if (statusFilter !== "all") params.status = statusFilter;\n                const { data } = await api.get(`/interviews`, { params });',
  "dashboard sends status filter",
);
replaceOnce(
  dashboardPage,
  '    }, [user, page, limit]);',
  '    }, [user, page, limit, statusFilter]);',
  "dashboard status dependency",
);

const interviewController = "server/src/controllers/interviewController.js";
const newGetInterviews = `export const getInterviews = async (req, res, next) => {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
        const status = ["completed", "in_progress"].includes(req.query.status) ? req.query.status : "all";
        const filter = { user: req.user._id };
        const paginationRequested = typeof req.query.page !== "undefined" || typeof req.query.limit !== "undefined";
        const itemsRaw = await Interview.find(filter)
            .sort({ createdAt: -1 })
            .populate({ path: "rounds.round", select: "status" })
            .lean();

        const withProgress = (itemsRaw || []).map((it) => {
            try {
                const rounds = Array.isArray(it?.rounds) ? it.rounds : [];
                const totalRounds = rounds.length;
                const completed = rounds.reduce((acc, r) => acc + (r?.round?.status === "completed" ? 1 : 0), 0);
                return { ...it, roundsCompleted: completed, roundsTotal: totalRounds, isCompleted: totalRounds > 0 && completed === totalRounds };
            } catch {
                return { ...it, roundsCompleted: 0, roundsTotal: 0, isCompleted: false };
            }
        });
        const items = withProgress.filter((item) => status === "all" ? true : status === "completed" ? item.isCompleted : !item.isCompleted);
        const total = items.length;

        if (!paginationRequested) return res.status(200).json(items);
        const totalPages = Math.max(Math.ceil(total / limit), 1);
        const pageItems = items.slice((page - 1) * limit, page * limit);
        return res.status(200).json({ items: pageItems, total, page, limit, totalPages });
    } catch (error) {
        return next(error instanceof Error ? error : new Error(String(error)));
    }
};`;
replaceRegex(
  interviewController,
  /export const getInterviews = async \(req, res, next\) => \{[\s\S]*?\n\};\n\nexport const getProgressSummary/,
  `${newGetInterviews}\n\nexport const getProgressSummary`,
  "interviews server-side status filtering",
);

const candidatePage = "client/src/pages/CandidateAssessmentPage.jsx";
replaceOnce(
  candidatePage,
  '    const { shareToken } = useParams();\n    const storageKey = `assessment-attempt:${shareToken}`;\n    const invitationId = useMemo(() => new URLSearchParams(window.location.search).get("invite") || "", []);',
  '    const { shareToken } = useParams();\n    const invitationId = useMemo(() => new URLSearchParams(window.location.search).get("invite") || "", []);\n    const storageKey = useMemo(() => `assessment-attempt:${shareToken}:${invitationId || "open"}`, [invitationId, shareToken]);',
  "candidate storage key scoped by invitation",
);
replaceOnce(
  candidatePage,
  '    const [lastSavedAt, setLastSavedAt] = useState(null);',
  '    const [lastSavedAt, setLastSavedAt] = useState(null);\n    const [restoreNotice, setRestoreNotice] = useState("");',
  "candidate restore notice state",
);
replaceOnce(
  candidatePage,
  '                const saved = readSavedAttempt(storageKey);\n                if (saved?.attempt && saved?.attemptToken) {\n                    setAttempt(saved.attempt);\n                    setAttemptToken(saved.attemptToken);\n                    setDirty(saved.dirty || {});\n                    setLastSavedAt(saved.savedAt || null);\n                    setActiveRoundIndex(Math.max(0, Number(saved.navigation?.activeRoundIndex) || 0));\n                    setActiveQuestionIndex(Math.max(0, Number(saved.navigation?.activeQuestionIndex) || 0));\n                    setRoundTransition(saved.navigation?.roundTransition || null);\n                }',
  '                const saved = readSavedAttempt(storageKey);\n                if (saved?.attempt && saved?.attemptToken) {\n                    setAttempt(saved.attempt);\n                    setAttemptToken(saved.attemptToken);\n                    setDirty(saved.dirty || {});\n                    setLastSavedAt(saved.savedAt || null);\n                    setActiveRoundIndex(Math.max(0, Number(saved.navigation?.activeRoundIndex) || 0));\n                    setActiveQuestionIndex(Math.max(0, Number(saved.navigation?.activeQuestionIndex) || 0));\n                    setRoundTransition(saved.navigation?.roundTransition || null);\n                    setRestoreNotice("We found a saved attempt on this device. Continue from where you left off, or start over if this is not your attempt.");\n                }',
  "candidate restore banner trigger",
);
replaceOnce(
  candidatePage,
  '            dirty: nextDirty,\n            savedAt,\n            navigation: { activeRoundIndex, activeQuestionIndex, roundTransition },',
  '            dirty: nextDirty,\n            identity,\n            invitationId,\n            savedAt,\n            navigation: { activeRoundIndex, activeQuestionIndex, roundTransition },',
  "candidate persist identity metadata",
);
replaceOnce(
  candidatePage,
  '    }, [activeQuestionIndex, activeRoundIndex, attemptToken, dirty, roundTransition, storageKey]);',
  '    }, [activeQuestionIndex, activeRoundIndex, attemptToken, dirty, identity, invitationId, roundTransition, storageKey]);',
  "candidate persist deps",
);
replaceOnce(
  candidatePage,
  '        writeSavedAttempt(storageKey, { attempt, attemptToken, dirty, savedAt, navigation: { activeRoundIndex, activeQuestionIndex, roundTransition } });',
  '        writeSavedAttempt(storageKey, { attempt, attemptToken, dirty, identity, invitationId, savedAt, navigation: { activeRoundIndex, activeQuestionIndex, roundTransition } });',
  "candidate autosave identity metadata",
);
replaceOnce(
  candidatePage,
  '    }, [activeQuestionIndex, activeRoundIndex, attempt, attemptToken, dirty, roundTransition, storageKey]);',
  '    }, [activeQuestionIndex, activeRoundIndex, attempt, attemptToken, dirty, identity, invitationId, roundTransition, storageKey]);',
  "candidate autosave deps",
);
replaceOnce(
  candidatePage,
  '            setActiveQuestionIndex(0);\n            setRoundTransition(null);\n            persist(data.attempt, data.attemptToken, {});',
  '            setActiveQuestionIndex(0);\n            setRoundTransition(null);\n            setRestoreNotice("");\n            persist(data.attempt, data.attemptToken, {});',
  "candidate clears restore notice on start",
);
replaceOnce(
  candidatePage,
  '            removeSavedAttempt(storageKey);\n            setSubmitted(true);',
  '            removeSavedAttempt(storageKey);\n            setRestoreNotice("");\n            setSubmitted(true);',
  "candidate clears restore notice on submit",
);
replaceOnce(
  candidatePage,
  '                    {assessment.integrity?.requireFullscreen && !fullscreenActive && <Alert severity="warning" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={enterFullscreen}>Enter fullscreen</Button>}>Fullscreen is required for this assessment.</Alert>}',
  '                    {restoreNotice && <Alert severity="info" sx={{ mb: 2 }} action={<Stack direction="row" spacing={1}><Button color="inherit" size="small" onClick={() => setRestoreNotice("")}>Continue</Button><Button color="inherit" size="small" onClick={() => { removeSavedAttempt(storageKey); setAttempt(null); setAttemptToken(""); setDirty({}); setRestoreNotice(""); }}>Start over</Button></Stack>}>{restoreNotice}</Alert>}\n                    {assessment.integrity?.requireFullscreen && !fullscreenActive && <Alert severity="warning" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={enterFullscreen}>Enter fullscreen</Button>}>Fullscreen is required for this assessment.</Alert>}',
  "candidate visible restore controls",
);

fs.rmSync(".github/workflows/apply-app-ux-fixes.yml", { force: true });
fs.rmSync(".github/scripts/apply-app-ux-fixes.mjs", { force: true });

console.log(`Applied ${changed.length} targeted fixes.`);
for (const item of changed) console.log(`- ${item}`);
