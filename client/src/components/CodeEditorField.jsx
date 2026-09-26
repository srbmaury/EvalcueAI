import { lazy, memo, Suspense, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
    TextField,
    Stack,
    IconButton,
    Button,
    Select,
    MenuItem,
    Tooltip,
    Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import CodeIcon from "@mui/icons-material/Code";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import api from "../api/axios";
import { AuthContext } from "../context/AuthContext";
import { storage, storageKeys } from "../utils/interviewStorage";

// Monaco is several megabytes. Keep it out of the network path until the user
// explicitly switches a plain answer field into code-editor mode.
const MonacoEditor = lazy(() => import("react-monaco-editor"));

const languages = [
    { label: "JavaScript", value: "javascript" },
    { label: "Python", value: "python" },
    { label: "C++", value: "cpp" },
    { label: "Java", value: "java" },
    // Syntax highlighting only: the code runner has no database, so SQL answers are reviewed, not executed.
    { label: "SQL", value: "sql", runnable: false },
];
const isRunnable = (value) => languages.find((item) => item.value === value)?.runnable !== false;

// A problem that names its language ("Implement … in Python") should open in that language.
const languageMentionedIn = (text = "") => {
    if (/\bsql\b|\bquery\b.*\b(table|column)s?\b/i.test(text)) return "sql";
    if (/\bpython\b/i.test(text)) return "python";
    if (/\bjava\b(?!\s*script)/i.test(text)) return "java";
    if (/\b(java\s*script|typescript|node(\.js)?|react)\b/i.test(text)) return "javascript";
    if (/c\+\+|\bcpp\b/i.test(text)) return "cpp";
    return null;
};

const CodeEditorField = ({ value, onChange, onFocus, minRows = 6, outlinedInputSx, onModeChange, draftKey, suggestCode = false, questionText = "", executionEndpoint = "/run-code", executionHeaders = {}, skipAuthRedirect = false, canRun = true }) => {
    const muiTheme = useTheme();
    const authContext = useContext(AuthContext);
    const preferredProgrammingLanguage = authContext?.user?.preferredProgrammingLanguage;
    const [useEditor, setUseEditor] = useState(() => Boolean(suggestCode));
    const [language, setLanguage] = useState("cpp");
    const languageChosenRef = useRef(false);
    const chooseLanguage = (value) => { languageChosenRef.current = true; setLanguage(value); };
    const [stdin, setStdin] = useState("");
    const [isRunning, setIsRunning] = useState(false);
    const [output, setOutput] = useState("");
    const [runError, setRunError] = useState("");
    const [execMeta, setExecMeta] = useState(null);
    const editorRef = useRef(null);
    const [editorHeight, setEditorHeight] = useState(300);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const dragStateRef = useRef({ dragging: false, startY: 0, startH: 0 });
    const autoResizeRef = useRef(true);
    const [editorTheme, setEditorTheme] = useState(() => {
        try {
            const saved = localStorage.getItem("codeEditorTheme");
            if (saved === "vs-light" || saved === "vs-dark") return saved;
        } catch { /* no-op */ }
        return muiTheme.palette.mode === "dark" ? "vs-dark" : "vs-light";
    });

    useEffect(() => {
        if (!draftKey) return;
        const saved = storage.get(storageKeys.codeEditor(draftKey));
        const enabled = typeof saved?.enabled === "boolean" ? saved.enabled : Boolean(suggestCode);
        setUseEditor(enabled);
        // Only a language the user explicitly picked is restored; otherwise auto-detection below applies.
        languageChosenRef.current = Boolean(saved?.languageChosen);
        if (saved?.languageChosen && languages.some((item) => item.value === saved.language)) setLanguage(saved.language);
        setStdin(saved?.stdin || "");
        onModeChange?.(enabled);
    }, [draftKey, suggestCode]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!draftKey) return;
        storage.set(storageKeys.codeEditor(draftKey), { enabled: useEditor, language, languageChosen: languageChosenRef.current, stdin });
    }, [draftKey, useEditor, language, stdin]);

    useEffect(() => {
        if (draftKey) {
            const saved = storage.get(storageKeys.codeEditor(draftKey));
            if (saved?.languageChosen && languages.some((item) => item.value === saved.language)) return;
        }
        const mentioned = languageMentionedIn(questionText);
        if (mentioned) {
            setLanguage(mentioned);
        } else if (preferredProgrammingLanguage && languages.some((item) => item.value === preferredProgrammingLanguage)) {
            setLanguage(preferredProgrammingLanguage);
        }
    }, [draftKey, preferredProgrammingLanguage, questionText]);

    // Theme-derived colors for fullscreen mode
    const isLightTheme = editorTheme === "vs-light";
    const fsBg = isLightTheme ? "#f8f8f8" : "#0b0f12";
    const fsColor = isLightTheme ? "#1a1a1a" : "#e0e0e0";
    const fsHeaderBg = isLightTheme ? "rgba(230,230,230,0.97)" : "rgba(20,22,25,0.9)";
    const fsHeaderBorder = isLightTheme ? "#c8c8c8" : "#222";
    const fsOutputBg = isLightTheme ? "#efefef" : "#0f1418";
    const fsOutputBorder = isLightTheme ? "#ccc" : "#333";
    const fsOutputColor = isLightTheme ? "#1a1a1a" : "#e0e0e0";

    const toggleTheme = useCallback(() => {
        const next = editorTheme === "vs-dark" ? "vs-light" : "vs-dark";
        setEditorTheme(next);
        try { localStorage.setItem("codeEditorTheme", next); } catch { /* no-op */ }
    }, [editorTheme]);

    const handleRunCode = useCallback(async () => {
        if (!useEditor || !isRunnable(language)) return;
        setRunError("");
        setOutput("");
        setExecMeta(null);

        if (!value || !String(value).trim()) {
            setRunError("Please enter some code to run.");
            return;
        }

        try {
            setIsRunning(true);
            const response = await api.post(executionEndpoint, {
                language,
                code: value,
                stdin,
            }, { skipAuthRedirect, headers: executionHeaders });
            const d = response?.data || {};
            setOutput(d?.output ?? "");
            setExecMeta({
                status: d?.status,
                stdout: d?.stdout,
                stderr: d?.stderr,
                compileOutput: d?.compileOutput,
                message: d?.message,
                isError: d?.isError,
                errorType: d?.errorType,
                time: d?.time,
                memory: d?.memory,
            });
        } catch (err) {
            const message =
                err?.response?.data?.error ||
                err?.message ||
                "Failed to run code";
            setRunError(message);
        } finally {
            setIsRunning(false);
        }
    }, [useEditor, value, language, stdin, executionEndpoint, executionHeaders, skipAuthRedirect]);

    const handleEditorDidMount = useCallback((editor, monaco) => {
        editorRef.current = editor;
        const lineHeight = editor.getOption(monaco.editor.EditorOption.lineHeight) || 18;
        const minimumEditorHeight = (minRows || 6) * lineHeight + 20;
        // Keep the assessment editor workstation-sized. Once code exceeds this
        // height Monaco should scroll internally instead of growing the whole
        // page into a multi-thousand-pixel editor.
        const viewportBound = typeof window !== "undefined" ? window.innerHeight - 240 : 560;
        const maximumEditorHeight = Math.max(minimumEditorHeight, Math.min(640, Math.max(360, viewportBound)));

        const updateEditorHeight = () => {
            if (!editorRef.current) return;
            if (!autoResizeRef.current) return;
            const contentHeight = editorRef.current.getContentHeight();
            const nextHeight = Math.max(contentHeight, minimumEditorHeight);
            const clampedHeight = Math.min(nextHeight, maximumEditorHeight);
            // Monaco emits another content-size event when its container is laid
            // out. Avoid setting identical height state (and explicitly laying
            // out from inside that event), which otherwise creates a render loop.
            setEditorHeight((current) => current === clampedHeight ? current : clampedHeight);
        };

        editor.onDidContentSizeChange(updateEditorHeight);
        editor.onDidFocusEditorText(() => onFocus?.());
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => { handleRunCode(); });
        editor.addCommand(monaco.KeyCode.F9, () => { handleRunCode(); });
        updateEditorHeight();
    }, [handleRunCode, minRows, onFocus]);

    const outputValue = execMeta?.isError
        ? execMeta?.errorType === "compile"
            ? execMeta?.compileOutput || output || runError
            : execMeta?.stderr || output || runError
        : output;

    const outputLabel = execMeta?.isError
        ? execMeta?.errorType === "compile" ? "Compilation Error" : "Runtime/Error"
        : "Output";

    return (
        <>
            <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                <Typography variant="body2">
                    {useEditor ? "Code Editor:" : "Answer:"}
                </Typography>
                <IconButton onClick={() => setUseEditor((current) => { const next = !current; onModeChange?.(next); return next; })} size="small" aria-label={useEditor ? "Use text answer" : "Use code editor"}>
                    <CodeIcon />
                </IconButton>
                {useEditor && canRun && (
                    <Tooltip title={isLightTheme ? "Switch to dark theme" : "Switch to light theme"}>
                        <IconButton onClick={toggleTheme} size="small">
                            {isLightTheme ? <Brightness4Icon /> : <Brightness7Icon />}
                        </IconButton>
                    </Tooltip>
                )}
                {useEditor && (
                    <Select
                        size="small"
                        value={language}
                        onChange={(e) => chooseLanguage(e.target.value)}
                    >
                        {languages.map((lang) => (
                            <MenuItem key={lang.value} value={lang.value}>
                                {lang.label}
                            </MenuItem>
                        ))}
                    </Select>
                )}
                {useEditor && (
                    <Button
                        size="small"
                        variant="contained"
                        onClick={handleRunCode}
                        disabled={isRunning || !isRunnable(language)}
                        startIcon={<PlayArrowIcon />}
                    >
                        {isRunning ? "Running..." : "Run"}
                    </Button>
                )}
                {useEditor && (
                    <Button
                        size="small"
                        variant="outlined"
                        onClick={() => setIsFullscreen((f) => !f)}
                    >
                        {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                    </Button>
                )}
            </Stack>

            {/* Stdin — only visible when not in fullscreen (fullscreen has its own copy below) */}
            {useEditor && !isFullscreen && (
                <TextField
                    fullWidth
                    multiline
                    minRows={2}
                    placeholder="Input for your code (stdin)"
                    value={stdin}
                    onChange={(e) => setStdin(e.target.value)}
                    sx={{ mb: 1 }}
                />
            )}

            {useEditor ? (
                <div
                    style={
                        isFullscreen
                            ? {
                                  position: "fixed",
                                  inset: 0,
                                  zIndex: 1600,
                                  background: fsBg,
                                  padding: 16,
                                  color: fsColor,
                                  overflowY: "auto",
                              }
                            : {}
                    }
                >
                    {isFullscreen && (
                        <>
                            {/* Fullscreen toolbar */}
                            <div style={{
                                position: "sticky",
                                top: 0,
                                display: "flex",
                                gap: 8,
                                alignItems: "center",
                                marginBottom: 8,
                                zIndex: 2,
                                background: fsHeaderBg,
                                padding: 8,
                                borderRadius: 8,
                                border: `1px solid ${fsHeaderBorder}`,
                            }}>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    color="inherit"
                                    onClick={() => setIsFullscreen(false)}
                                    sx={{ borderColor: isLightTheme ? "#999" : "#777", color: fsColor }}
                                >
                                    Exit Fullscreen
                                </Button>
                                <Tooltip title={isLightTheme ? "Switch to dark theme" : "Switch to light theme"}>
                                <IconButton
                                    onClick={toggleTheme}
                                    size="small"
                                    sx={{ color: fsColor }}
                                >
                                    {isLightTheme ? <Brightness4Icon /> : <Brightness7Icon />}
                                </IconButton>
                                </Tooltip>
                                <Select
                                    size="small"
                                    value={language}
                                    onChange={(e) => chooseLanguage(e.target.value)}
                                    MenuProps={isLightTheme ? {} : {
                                        disablePortal: true,
                                        PaperProps: { sx: { bgcolor: "#0f1418", color: "#e0e0e0" } },
                                    }}
                                    sx={isLightTheme ? {} : { bgcolor: "#0f1418", color: "#e0e0e0" }}
                                >
                                    {languages.map((lang) => (
                                        <MenuItem key={lang.value} value={lang.value}>
                                            {lang.label}
                                        </MenuItem>
                                    ))}
                                </Select>
                                <Button
                                    size="small"
                                    variant="contained"
                                    color="primary"
                                    onClick={handleRunCode}
                                    disabled={isRunning || !isRunnable(language)}
                                    startIcon={<PlayArrowIcon />}
                                >
                                    {isRunning ? "Running..." : "Run"}
                                </Button>
                            </div>

                            {/* Stdin inside fullscreen */}
                            <TextField
                                fullWidth
                                multiline
                                minRows={2}
                                placeholder="Input for your code (stdin)"
                                value={stdin}
                                onChange={(e) => setStdin(e.target.value)}
                                sx={{
                                    mb: 1,
                                    ...(isLightTheme ? {} : {
                                        "& .MuiOutlinedInput-root": {
                                            color: "#e0e0e0",
                                            "& fieldset": { borderColor: "#444" },
                                        },
                                        "& .MuiInputBase-inputMultiline": { color: "#e0e0e0" },
                                    }),
                                }}
                                inputProps={{ style: isLightTheme ? {} : { color: "#e0e0e0" } }}
                            />
                        </>
                    )}

                    <Suspense
                        fallback={(
                            <div
                                role="status"
                                style={{
                                    height: isFullscreen ? "55vh" : editorHeight,
                                    display: "grid",
                                    placeItems: "center",
                                    border: `1px solid ${fsOutputBorder}`,
                                    borderRadius: 4,
                                }}
                            >
                                Loading code editor…
                            </div>
                        )}
                    >
                        <MonacoEditor
                            width="100%"
                            height={isFullscreen ? "55vh" : editorHeight}
                            language={language}
                            theme={editorTheme}
                            value={value}
                            options={{
                                automaticLayout: true,
                                minimap: { enabled: false },
                                scrollBeyondLastLine: false,
                                scrollbar: {
                                    vertical: "auto",
                                    horizontal: "auto",
                                    verticalScrollbarSize: 12,
                                    horizontalScrollbarSize: 10,
                                    alwaysConsumeMouseWheel: false,
                                },
                                wordWrap: "on",
                                smoothScrolling: true,
                                tabSize: 4,
                                insertSpaces: true,
                                autoClosingBrackets: "always",
                                autoIndent: "full",
                            }}
                            onChange={onChange}
                            editorDidMount={handleEditorDidMount}
                        />
                    </Suspense>

                    {/* Output section — shown inside fullscreen */}
                    {isFullscreen && (output || runError || execMeta) && (
                        <div style={{ marginTop: 12 }}>
                            <Typography
                                variant="caption"
                                sx={{
                                    display: "block",
                                    mb: 0.5,
                                    color: execMeta?.isError ? "#f44336" : fsColor,
                                    opacity: 0.8,
                                }}
                            >
                                {outputLabel}
                            </Typography>
                            <TextField
                                value={outputValue}
                                multiline
                                minRows={6}
                                maxRows={12}
                                InputProps={{ readOnly: true }}
                                sx={{
                                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                                    width: "100%",
                                    "& .MuiOutlinedInput-notchedOutline": { borderColor: fsOutputBorder },
                                    "& .MuiInputBase-inputMultiline": { color: fsOutputColor },
                                    background: fsOutputBg,
                                }}
                            />
                        </div>
                    )}

                    {!isFullscreen && (
                        <Tooltip title="Drag to resize editor">
                        <div
                            style={{
                                width: "100%",
                                height: 8,
                                cursor: "ns-resize",
                                background: "linear-gradient(transparent 3px, rgba(128,128,128,0.2) 3px, rgba(128,128,128,0.2) 5px, transparent 5px)",
                                userSelect: "none",
                            }}
                            onMouseDown={(e) => {
                                autoResizeRef.current = false;
                                dragStateRef.current = { dragging: true, startY: e.clientY, startH: editorHeight };
                                const onMove = (ev) => {
                                    if (!dragStateRef.current.dragging) return;
                                    const delta = ev.clientY - dragStateRef.current.startY;
                                    const next = Math.max(120, dragStateRef.current.startH + delta);
                                    setEditorHeight(next);
                                    if (editorRef.current) editorRef.current.layout();
                                };
                                const onUp = () => {
                                    dragStateRef.current.dragging = false;
                                    window.removeEventListener("mousemove", onMove);
                                    window.removeEventListener("mouseup", onUp);
                                };
                                window.addEventListener("mousemove", onMove);
                                window.addEventListener("mouseup", onUp);
                            }}
                            onDoubleClick={() => {
                                autoResizeRef.current = true;
                                if (editorRef.current) editorRef.current.layout();
                            }}
                        />
                        </Tooltip>
                    )}
                </div>
            ) : (
                <TextField
                    fullWidth
                    multiline
                    minRows={minRows}
                    placeholder="Answer by typing or speaking..."
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onFocus={onFocus}
                    variant="outlined"
                    sx={outlinedInputSx}
                />
            )}

            {/* Output section — shown outside fullscreen */}
            {useEditor && !isFullscreen && (output || runError || execMeta) && (
                <Stack mt={1} spacing={0.5}>
                    <Typography
                        variant="caption"
                        color={execMeta?.isError ? "error" : "text.secondary"}
                    >
                        {outputLabel}
                    </Typography>
                    <TextField
                        value={outputValue}
                        multiline
                        minRows={3}
                        maxRows={10}
                        InputProps={{ readOnly: true }}
                        sx={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                    />
                    <Typography variant="caption" color="text.secondary">
                        {isRunnable(language) ? "Shortcuts: Run (Cmd/Ctrl+Enter or F9)." : "SQL answers are reviewed, not executed. Explain any assumptions about the schema."}
                    </Typography>
                </Stack>
            )}
        </>
    );
};

export default memo(CodeEditorField);