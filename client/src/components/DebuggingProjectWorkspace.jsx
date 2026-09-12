import { lazy, Suspense, useMemo, useState } from "react";
import {
    Alert, Box, Button, Chip, Divider, FormControl, IconButton, InputLabel,
    MenuItem, Paper, Select, Stack, TextField, Tooltip, Typography,
} from "@mui/material";
import AddRounded from "@mui/icons-material/AddRounded";
import CreateNewFolderRounded from "@mui/icons-material/CreateNewFolderRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import DriveFileRenameOutlineRounded from "@mui/icons-material/DriveFileRenameOutlineRounded";
import FolderRounded from "@mui/icons-material/FolderRounded";
import InsertDriveFileOutlined from "@mui/icons-material/InsertDriveFileOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";
import { addProjectFile, addProjectFolder, deleteProjectPath, languageForPath, projectFolders, renameProjectPath, updateProjectFile } from "../utils/debuggingProject";

const MonacoEditor = lazy(() => import("react-monaco-editor"));
const kindLabel = (kind) => kind === "hidden_test" ? "Hidden test" : kind === "visible_test" ? "Visible test" : "Source";

export default function DebuggingProjectWorkspace({
    files = [], runtime = "node-22", selectedPath: controlledSelectedPath, onSelect, onFilesChange,
    readOnly = false, allowClassification = false, hideHidden = false, protectTests = false,
}) {
    const visibleFiles = useMemo(() => files.filter((file) => !(hideHidden && file.kind === "hidden_test")), [files, hideHidden]);
    const folders = useMemo(() => projectFolders(visibleFiles), [visibleFiles]);
    const [internalSelectedPath, setInternalSelectedPath] = useState(() => visibleFiles.find((file) => file.kind !== "hidden_test")?.path || "");
    const selectedPath = controlledSelectedPath ?? internalSelectedPath;
    const selectedFile = visibleFiles.find((file) => file.path === selectedPath) || visibleFiles[0] || null;
    const [newPath, setNewPath] = useState("");
    const [newFolder, setNewFolder] = useState("");
    const [renameTo, setRenameTo] = useState("");
    const [error, setError] = useState("");

    const select = (path) => { setInternalSelectedPath(path); onSelect?.(path); setRenameTo(""); };
    const apply = (fn) => {
        setError("");
        try { const next = fn(); onFilesChange?.(next); return next; }
        catch (err) { setError(err?.message || "Project change could not be applied."); return null; }
    };
    const createFile = () => {
        const next = apply(() => addProjectFile(files, newPath));
        if (!next) return;
        const path = next[next.length - 1]?.path;
        setNewPath("");
        if (path) select(path);
    };
    const createFolder = () => { const next = apply(() => addProjectFolder(files, newFolder)); if (next) setNewFolder(""); };
    const selectedProtected = protectTests && selectedFile?.kind !== "source";
    const renameSelected = () => {
        if (!selectedFile || selectedProtected || !renameTo.trim()) return;
        const next = apply(() => renameProjectPath(files, selectedFile.path, renameTo));
        if (next) select(renameTo.trim().replace(/\\/g, "/"));
    };
    const removeSelected = () => {
        if (!selectedFile || selectedProtected) return;
        const next = apply(() => deleteProjectPath(files, selectedFile.path));
        if (!next) return;
        select((next.find((file) => file.kind !== "hidden_test") || next[0])?.path || "");
    };
    const editorReadOnly = readOnly || (protectTests && selectedFile?.kind !== "source");

    return <Stack spacing={1.5}>
        {error && <Alert severity="error">{error}</Alert>}
        {!readOnly && <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                <TextField size="small" fullWidth label="New file path" placeholder="src/services/PaymentService.js" value={newPath} onChange={(e) => setNewPath(e.target.value)} />
                <Button startIcon={<AddRounded />} variant="outlined" onClick={createFile} disabled={!newPath.trim()}>New file</Button>
                <TextField size="small" fullWidth label="New folder path" placeholder="src/services" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} />
                <Button startIcon={<CreateNewFolderRounded />} variant="outlined" onClick={createFolder} disabled={!newFolder.trim()}>New folder</Button>
            </Stack>
        </Paper>}
        <Paper variant="outlined" sx={{ overflow: "hidden" }}>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(220px,.65fr) minmax(0,1.35fr)" }, minHeight: 460 }}>
                <Box sx={{ borderRight: { md: "1px solid" }, borderBottom: { xs: "1px solid", md: 0 }, borderColor: "divider", p: 1.25, minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={850}>PROJECT FILES</Typography>
                    {!!folders.length && <Stack spacing={0.25} mt={1} mb={1}>{folders.map((folder) => <Stack key={folder} direction="row" alignItems="center" spacing={0.5} sx={{ pl: Math.max(0, folder.split("/").length - 1) * 1.25 }}><FolderRounded fontSize="small" color="action" /><Typography variant="caption" sx={{ overflowWrap: "anywhere" }}>{folder}</Typography></Stack>)}</Stack>}
                    <Stack spacing={0.25}>
                        {visibleFiles.filter((file) => !file.path.endsWith("/.gitkeep")).sort((a, b) => a.path.localeCompare(b.path)).map((file) => <Button key={file.path} onClick={() => select(file.path)} variant={selectedFile?.path === file.path ? "contained" : "text"} color={file.kind === "hidden_test" ? "warning" : "inherit"} startIcon={file.kind === "hidden_test" ? <LockOutlined /> : <InsertDriveFileOutlined />} sx={{ justifyContent: "flex-start", textTransform: "none", minWidth: 0 }}><Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.path}</Box></Button>)}
                        {!visibleFiles.length && <Typography variant="body2" color="text.secondary" p={1}>No project files yet.</Typography>}
                    </Stack>
                </Box>
                <Box sx={{ p: 1.5, minWidth: 0 }}>
                    {selectedFile ? <Stack spacing={1.25}>
                        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1} alignItems={{ sm: "center" }}>
                            <Box sx={{ minWidth: 0 }}><Typography fontWeight={800} sx={{ overflowWrap: "anywhere" }}>{selectedFile.path}</Typography><Chip size="small" sx={{ mt: .5 }} label={kindLabel(selectedFile.kind)} variant="outlined" /></Box>
                            {!readOnly && <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                {allowClassification && <FormControl size="small" sx={{ minWidth: 135 }}><InputLabel id="debug-file-kind-label">File type</InputLabel><Select labelId="debug-file-kind-label" label="File type" value={selectedFile.kind} onChange={(e) => onFilesChange?.(updateProjectFile(files, selectedFile.path, { kind: e.target.value }))}><MenuItem value="source">Source</MenuItem><MenuItem value="visible_test">Visible test</MenuItem><MenuItem value="hidden_test">Hidden test</MenuItem></Select></FormControl>}
                                {!selectedProtected && <><TextField size="small" label="Rename path" value={renameTo} onChange={(e) => setRenameTo(e.target.value)} /><Tooltip title="Rename file"><span><IconButton disabled={!renameTo.trim()} aria-label="Rename selected file" onClick={renameSelected}><DriveFileRenameOutlineRounded /></IconButton></span></Tooltip><Tooltip title="Delete file"><IconButton aria-label="Delete selected file" color="error" onClick={removeSelected}><DeleteOutlineRounded /></IconButton></Tooltip></>}
                            </Stack>}
                        </Stack>
                        {selectedFile.path.endsWith("/.gitkeep") ? <Alert severity="info">This marker preserves an empty folder. Add a real file in the folder when ready.</Alert> : <Suspense fallback={<Box role="status" sx={{ height: 380, display: "grid", placeItems: "center" }}>Loading editor…</Box>}><MonacoEditor width="100%" height="380px" language={languageForPath(selectedFile.path, runtime)} theme="vs-dark" value={selectedFile.content || ""} options={{ automaticLayout: true, minimap: { enabled: false }, readOnly: editorReadOnly, scrollBeyondLastLine: false, wordWrap: "on" }} onChange={(value) => { if (!editorReadOnly) onFilesChange?.(updateProjectFile(files, selectedFile.path, { content: value || "" })); }} /></Suspense>}
                        {selectedProtected && <Typography variant="caption" color="text.secondary">Test files are read-only in the candidate workspace.</Typography>}
                    </Stack> : <Box sx={{ minHeight: 380, display: "grid", placeItems: "center" }}><Typography color="text.secondary">Choose a project file.</Typography></Box>}
                </Box>
            </Box>
            <Divider /><Box sx={{ px: 1.5, py: 1 }}><Typography variant="caption" color="text.secondary">{visibleFiles.length} file{visibleFiles.length === 1 ? "" : "s"} · {files.filter((file) => file.kind === "hidden_test").length} hidden test{files.filter((file) => file.kind === "hidden_test").length === 1 ? "" : "s"}</Typography></Box>
        </Paper>
    </Stack>;
}
