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
import { addProjectFile, addProjectFolder, deleteProjectPath, languageForPath, renameProjectPath, updateProjectFile } from "../utils/debuggingProject";

const MonacoEditor = lazy(() => import("react-monaco-editor"));
const basename = (path) => String(path || "").split("/").pop() || "";
const isMarker = (file) => String(file?.path || "").endsWith("/.gitkeep");

const buildTree = (files) => {
    const root = { path: "", name: "", folders: {}, files: [] };
    files.forEach((file) => {
        const parts = String(file.path || "").split("/").filter(Boolean);
        if (!parts.length) return;
        let node = root;
        parts.slice(0, -1).forEach((part) => {
            const path = node.path ? `${node.path}/${part}` : part;
            node.folders[part] ||= { path, name: part, folders: {}, files: [] };
            node = node.folders[part];
        });
        if (!isMarker(file)) node.files.push(file);
    });
    return root;
};

const sortedFolders = (node) => Object.values(node.folders).sort((a, b) => a.name.localeCompare(b.name));
const sortedFiles = (node) => [...node.files].sort((a, b) => basename(a.path).localeCompare(basename(b.path)));

function FileButton({ file, selected, onSelect }) {
    const hidden = file.kind === "hidden_test";
    return <Button aria-label={file.path} onClick={() => onSelect(file.path)} variant={selected ? "contained" : "text"} color={hidden ? "warning" : "inherit"} startIcon={hidden ? <LockOutlined /> : <InsertDriveFileOutlined />} sx={{ justifyContent: "flex-start", textTransform: "none", width: "100%", minWidth: 0 }}>
        <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{basename(file.path)}</Box>
    </Button>;
}

function FolderTree({ node, selectedPath, onSelect }) {
    return <Box data-testid={`project-folder:${node.path}`} sx={{ minWidth: 0 }}>
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ px: .5, minHeight: 30 }}>
            <FolderRounded fontSize="small" color="action" />
            <Typography variant="caption" fontWeight={750}>{node.name}</Typography>
        </Stack>
        <Stack spacing={0.25} sx={{ pl: 1.75 }}>
            {sortedFiles(node).map((file) => <FileButton key={file.path} file={file} selected={selectedPath === file.path} onSelect={onSelect} />)}
            {sortedFolders(node).map((folder) => <FolderTree key={folder.path} node={folder} selectedPath={selectedPath} onSelect={onSelect} />)}
        </Stack>
    </Box>;
}

export default function DebuggingProjectWorkspace({
    files = [], runtime = "node-22", selectedPath: controlledSelectedPath, onSelect, onFilesChange,
    readOnly = false, allowClassification = false, hideHidden = false, protectTests = false,
}) {
    const visibleFiles = useMemo(() => files.filter((file) => !(hideHidden && file.kind === "hidden_test")), [files, hideHidden]);
    const selectableFiles = useMemo(() => visibleFiles.filter((file) => !isMarker(file)), [visibleFiles]);
    const tree = useMemo(() => buildTree(visibleFiles), [visibleFiles]);
    const [internalSelectedPath, setInternalSelectedPath] = useState(() => selectableFiles.find((file) => file.kind === "source")?.path || selectableFiles[0]?.path || "");
    const selectedPath = controlledSelectedPath ?? internalSelectedPath;
    const selectedFile = selectableFiles.find((file) => file.path === selectedPath) || selectableFiles[0] || null;
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
    const selectedProtected = protectTests && selectedFile?.kind === "hidden_test";
    const renameSelected = () => {
        if (!selectedFile || selectedProtected || !renameTo.trim()) return;
        const next = apply(() => renameProjectPath(files, selectedFile.path, renameTo));
        if (next) select(renameTo.trim().replace(/\\/g, "/"));
    };
    const removeSelected = () => {
        if (!selectedFile || selectedProtected) return;
        const next = apply(() => deleteProjectPath(files, selectedFile.path));
        if (!next) return;
        select(next.find((file) => file.kind === "source" && !isMarker(file))?.path || "");
    };
    const editorReadOnly = readOnly || selectedProtected;

    return <Stack spacing={1.5}>
        {error && <Alert severity="error">{error}</Alert>}
        {!readOnly && <Paper variant="outlined" sx={{ p: 1.5 }}><Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <TextField size="small" fullWidth label="New file path" placeholder="src/services/PaymentService.js" value={newPath} onChange={(e) => setNewPath(e.target.value)} />
            <Button startIcon={<AddRounded />} variant="outlined" onClick={createFile} disabled={!newPath.trim()}>New file</Button>
            <TextField size="small" fullWidth label="New folder path" placeholder="src/services" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} />
            <Button startIcon={<CreateNewFolderRounded />} variant="outlined" onClick={createFolder} disabled={!newFolder.trim()}>New folder</Button>
        </Stack></Paper>}
        <Paper variant="outlined" sx={{ overflow: "hidden" }}>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(220px,.65fr) minmax(0,1.35fr)" }, minHeight: 460 }}>
                <Box sx={{ borderRight: { md: "1px solid" }, borderBottom: { xs: "1px solid", md: 0 }, borderColor: "divider", p: 1.25, minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={850}>PROJECT FILES</Typography>
                    <Stack spacing={0.25} mt={1}>
                        {sortedFiles(tree).map((file) => <FileButton key={file.path} file={file} selected={selectedFile?.path === file.path} onSelect={select} />)}
                        {sortedFolders(tree).map((folder) => <FolderTree key={folder.path} node={folder} selectedPath={selectedFile?.path} onSelect={select} />)}
                        {!selectableFiles.length && <Typography variant="body2" color="text.secondary" p={1}>No project files yet.</Typography>}
                    </Stack>
                </Box>
                <Box sx={{ p: 1.5, minWidth: 0 }}>
                    {selectedFile ? <Stack spacing={1.25}>
                        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1} alignItems={{ sm: "center" }}>
                            <Box sx={{ minWidth: 0 }}><Typography fontWeight={800}>{basename(selectedFile.path)}</Typography><Chip size="small" sx={{ mt: .5 }} label={selectedFile.kind === "hidden_test" ? "Hidden test" : "Source"} variant="outlined" /></Box>
                            {!readOnly && <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                {allowClassification && <FormControl size="small" sx={{ minWidth: 135 }}><InputLabel id="debug-file-kind-label">File type</InputLabel><Select labelId="debug-file-kind-label" label="File type" value={selectedFile.kind} onChange={(e) => onFilesChange?.(updateProjectFile(files, selectedFile.path, { kind: e.target.value }))}><MenuItem value="source">Source</MenuItem><MenuItem value="hidden_test">Hidden test</MenuItem></Select></FormControl>}
                                {!selectedProtected && <><TextField size="small" label="Rename path" value={renameTo} onChange={(e) => setRenameTo(e.target.value)} /><Tooltip title="Rename file"><span><IconButton disabled={!renameTo.trim()} aria-label="Rename selected file" onClick={renameSelected}><DriveFileRenameOutlineRounded /></IconButton></span></Tooltip><Tooltip title="Delete file"><IconButton aria-label="Delete selected file" color="error" onClick={removeSelected}><DeleteOutlineRounded /></IconButton></Tooltip></>}
                            </Stack>}
                        </Stack>
                        {allowClassification && selectedFile.kind === "hidden_test" && <TextField size="small" label="Candidate-visible test name" value={selectedFile.displayName || ""} onChange={(e) => onFilesChange?.(updateProjectFile(files, selectedFile.path, { displayName: e.target.value }))} />}
                        <Suspense fallback={<Box role="status" sx={{ height: 380, display: "grid", placeItems: "center" }}>Loading editor…</Box>}><MonacoEditor width="100%" height="380px" language={languageForPath(selectedFile.path, runtime)} theme="vs-dark" value={selectedFile.content || ""} options={{ automaticLayout: true, minimap: { enabled: false }, readOnly: editorReadOnly, scrollBeyondLastLine: false, wordWrap: "on" }} onChange={(value) => { if (!editorReadOnly) onFilesChange?.(updateProjectFile(files, selectedFile.path, { content: value || "" })); }} /></Suspense>
                    </Stack> : <Box sx={{ minHeight: 380, display: "grid", placeItems: "center" }}><Typography color="text.secondary">Choose a project file.</Typography></Box>}
                </Box>
            </Box>
            <Divider /><Box sx={{ px: 1.5, py: 1 }}><Typography variant="caption" color="text.secondary">{selectableFiles.length} file{selectableFiles.length === 1 ? "" : "s"} · {files.filter((file) => file.kind === "hidden_test").length} hidden test{files.filter((file) => file.kind === "hidden_test").length === 1 ? "" : "s"}</Typography></Box>
        </Paper>
    </Stack>;
}
