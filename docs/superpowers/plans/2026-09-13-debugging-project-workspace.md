# Debugging Project Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the provisional single-file debugging round with a recruiter-authored, multi-file HackerRank-style project workspace executed through Judge0 multi-file mode.

**Architecture:** Keep debugging rounds embedded in the existing Hiring assessment model, but represent authored code as a validated immutable file snapshot and candidate work as a per-file overlay. The browser never receives hidden tests. Server-owned runtime profiles package source/tests plus trusted `compile`/`run` scripts into an in-memory ZIP and submit it to Judge0 multi-file language id `89`; normal coding questions continue using the existing single-file Judge0 path.

**Tech Stack:** React 19, MUI, Monaco, Express, Mongoose/MongoDB, Judge0 CE, Vitest/Testing Library, Node test runner/Supertest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-13-debugging-project-workspace-design.md`

## Global Constraints

- Feature flag is `ENABLE_DEBUGGING_ASSESSMENTS`; default behavior is disabled.
- Existing coding-question execution must remain unchanged.
- V1 project limits: max 100 files, max 256 KB per file, max 2 MB total source, UTF-8 text only.
- Project paths must be normalized relative paths; reject absolute paths, `..` traversal, empty paths, and symlinks.
- Hidden test files must never be serialized into candidate-facing payloads or visible-run diagnostics.
- Recruiters cannot supply shell commands. EvalCueAI owns runtime-profile compile/run commands.
- Candidate code never executes in the EvalCueAI API process.
- Judge0 multi-file submissions use `language_id: 89`.
- Working-session runs include source + visible tests only.
- Final submissions include source + visible tests + hidden tests.
- No internet/package-download requirement, external DB, Redis, Kafka, Docker-in-Docker, or external APIs in V1 project execution.
- Candidate debugging attempt endpoints require the existing attempt-token boundary.
- Recruiter authoring/validation requires existing organization authorization.
- Do not open a PR until exact-head CI is fully green.

---

## File Structure

### Server files to create

- `server/src/services/debuggingProject.js` — path validation, project limits, sanitization, candidate-overlay application, diff summary.
- `server/src/services/debuggingRuntimeProfiles.js` — trusted runtime profiles and generated `compile`/`run` scripts.
- `server/src/services/debuggingProjectRunner.js` — in-memory ZIP construction, Judge0 multi-file submission, normalized result, hidden-diagnostic filtering.
- `server/src/test/unit/debuggingProject.test.js` — project validation/overlay/security tests.
- `server/src/test/unit/debuggingProjectRunner.test.js` — archive/runtime/Judge0 multi-file tests.

### Server files to modify

- `server/src/models/Assessment.js` — replace provisional `starterCode/tests` with `runtime/entryFile/files[]`.
- `server/src/models/CandidateAttempt.js` — replace per-question `debugCode/debugFindings/debugTestResult` with round-level `debuggingResponses[]` project overlay/findings/final evaluation.
- `server/src/controllers/debuggingAssessmentController.js` — project-safe public payloads, recruiter validation, candidate workspace GET/PUT/run/submit endpoints.
- `server/src/routes/assessmentRoutes.js` — new project workspace routes and validation route.
- `server/src/services/debuggingTestRunner.js` — retire from debugging-project path; keep only if still referenced by non-project compatibility tests during migration, then delete.
- `server/src/test/unit/debuggingAssessmentModel.test.js` — update model contract.
- `server/src/test/e2e/debuggingAssessment.test.js` — update full API journey to multi-file shape.

### Client files to create

- `client/src/components/ProjectFileTree.jsx` — tree rendering and file/folder CRUD events.
- `client/src/components/DebuggingProjectWorkspace.jsx` — reusable file tree + Monaco editor shell with editable/read-only modes.
- `client/src/components/CandidateDebuggingRound.jsx` — candidate code-fix/findings experience, autosave, run tests, submit.
- `client/src/utils/debuggingProject.js` — path/file helpers for client-only presentation and immutable state updates.
- `client/src/__tests__/debuggingProjectWorkspace.test.jsx` — recruiter workspace component tests.
- `client/src/__tests__/candidateDebuggingRound.test.jsx` — candidate code-fix/findings component tests.

### Client files to modify

- `client/src/components/DebuggingRoundEditor.jsx` — rewrite from one `starterCode` editor to project workspace authoring + runtime + file classification + validation.
- `client/src/pages/AssessmentBuilderPage.jsx` — keep capability-gated fourth format; route debugging rounds into the specialized editor and validation state.
- `client/src/pages/CandidateAssessmentPage.jsx` — render `CandidateDebuggingRound` when active round is `debugging`.
- `client/src/pages/AssessmentReportPage.jsx` — render project diff, deterministic test summary, findings evidence.
- `client/src/__tests__/debuggingRoundEditor.test.jsx` — replace single-file expectations with multi-file authoring behavior.
- `client/src/__tests__/hiringBuilderWiring.test.js` — verify feature-gated debugging editor wiring.

### E2E/docs files to modify/create

- `client/e2e/debuggingAssessment.spec.js` — recruiter + candidate multi-file journeys and feature-off regression.
- `.env.example` and/or existing server env documentation — document `ENABLE_DEBUGGING_ASSESSMENTS=false`.
- `README.md` — document feature flag and V1 project/runtime constraints if the branch already documents experimental features there.

---

### Task 1: Replace the single-file persistence model with a validated multi-file project model

**Files:**
- Create: `server/src/services/debuggingProject.js`
- Create: `server/src/test/unit/debuggingProject.test.js`
- Modify: `server/src/models/Assessment.js`
- Modify: `server/src/models/CandidateAttempt.js`
- Modify: `server/src/test/unit/debuggingAssessmentModel.test.js`

**Interfaces:**
- Produces: `validateDebuggingProject(files) -> { files, totalBytes } | throws`.
- Produces: `sanitizeProjectForCandidate(files) -> files without kind === "hidden_test"`.
- Produces: `applyDebuggingOverlay(baseFiles, overlay) -> reconstructed files[]`.
- Produces: `summarizeDebuggingDiff(baseFiles, overlay) -> { changed, created, deleted, paths }`.
- Assessment round shape becomes `debugging: { responseMode, runtime, entryFile, files[] }`.
- Candidate attempt shape gains `debuggingResponses[]` keyed by `roundIndex`.

- [ ] **Step 1: Write failing unit tests for project validation and overlays**

Create tests covering exact constraints:

```js
import { describe, it, expect } from "vitest";
import {
  validateDebuggingProject,
  sanitizeProjectForCandidate,
  applyDebuggingOverlay,
  summarizeDebuggingDiff,
} from "../../services/debuggingProject.js";

describe("debugging project model", () => {
  it("rejects traversal and absolute paths", () => {
    expect(() => validateDebuggingProject([{ path: "../secret", content: "x", kind: "source" }])).toThrow(/path/i);
    expect(() => validateDebuggingProject([{ path: "/etc/passwd", content: "x", kind: "source" }])).toThrow(/path/i);
  });

  it("enforces file and total-byte limits", () => {
    expect(() => validateDebuggingProject(Array.from({ length: 101 }, (_, i) => ({ path: `src/${i}.js`, content: "x", kind: "source" })))).toThrow(/100 files/i);
    expect(() => validateDebuggingProject([{ path: "huge.js", content: "x".repeat(256 * 1024 + 1), kind: "source" }])).toThrow(/256 KB/i);
  });

  it("removes hidden tests from candidate payloads", () => {
    const files = sanitizeProjectForCandidate([
      { path: "src/a.js", content: "a", kind: "source" },
      { path: "tests/a.test.js", content: "v", kind: "visible_test" },
      { path: "hidden/a.test.js", content: "h", kind: "hidden_test" },
    ]);
    expect(files.map((f) => f.path)).toEqual(["src/a.js", "tests/a.test.js"]);
  });

  it("applies changed created and deleted candidate files without mutating the base", () => {
    const base = [
      { path: "src/a.js", content: "old", kind: "source" },
      { path: "src/b.js", content: "keep", kind: "source" },
    ];
    const overlay = {
      changedFiles: [{ path: "src/a.js", content: "new" }],
      createdFiles: [{ path: "src/c.js", content: "created" }],
      deletedFiles: ["src/b.js"],
    };
    expect(applyDebuggingOverlay(base, overlay).map(({ path, content }) => [path, content])).toEqual([
      ["src/a.js", "new"],
      ["src/c.js", "created"],
    ]);
    expect(base[0].content).toBe("old");
    expect(summarizeDebuggingDiff(base, overlay)).toMatchObject({ changed: 1, created: 1, deleted: 1 });
  });
});
```

- [ ] **Step 2: Run the new unit test and verify RED**

Run from `server`:

```bash
npm test -- --run src/test/unit/debuggingProject.test.js
```

Expected: fail because `debuggingProject.js` and the multi-file schema do not exist.

- [ ] **Step 3: Implement `debuggingProject.js` with exact V1 limits**

Implementation rules:

```js
export const PROJECT_LIMITS = {
  maxFiles: 100,
  maxFileBytes: 256 * 1024,
  maxProjectBytes: 2 * 1024 * 1024,
};
```

Normalize backslashes to `/`, reject empty/absolute/traversal paths, reject duplicate normalized paths, allow only `source`, `visible_test`, `hidden_test`, and use `Buffer.byteLength(content, "utf8")` for byte limits. `applyDebuggingOverlay` must reject edits/deletions that target a hidden test.

- [ ] **Step 4: Replace the Mongoose single-file debugging schema**

`Assessment.rounds[].debugging` must persist:

```js
{
  responseMode: { type: String, enum: ["code_fix", "findings"], required: true },
  runtime: { type: String, enum: ["java-21", "node-22", "python-3", "cpp-20"], required: true },
  entryFile: { type: String, default: "" },
  files: [{
    path: { type: String, required: true },
    content: { type: String, default: "" },
    kind: { type: String, enum: ["source", "visible_test", "hidden_test"], required: true },
  }],
}
```

`CandidateAttempt.debuggingResponses[]` must persist `roundIndex`, `responseMode`, `baseProjectFingerprint`, `changedFiles`, `createdFiles`, `deletedFiles`, `findings` with `rootCause/evidence/proposedFix/impact/testingStrategy`, `visibleTestRuns`, `finalEvaluation`, and `submittedAt`.

- [ ] **Step 5: Update model tests and run server unit tests**

Run:

```bash
npm test -- --run src/test/unit/debuggingProject.test.js src/test/unit/debuggingAssessmentModel.test.js
```

Expected: both files pass; existing non-debugging model tests remain green.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/debuggingProject.js server/src/models/Assessment.js server/src/models/CandidateAttempt.js server/src/test/unit/debuggingProject.test.js server/src/test/unit/debuggingAssessmentModel.test.js
git commit -m "feat: model multi-file debugging projects"
```

---

### Task 2: Add trusted runtime profiles and Judge0 multi-file project execution

**Files:**
- Create: `server/src/services/debuggingRuntimeProfiles.js`
- Create: `server/src/services/debuggingProjectRunner.js`
- Create: `server/src/test/unit/debuggingProjectRunner.test.js`
- Modify: `server/src/utils/runCode.js` only to reuse the existing Judge0 submit/poll transport without changing its single-file public API.
- Delete after migration if unreferenced: `server/src/services/debuggingTestRunner.js`
- Delete/update after migration if unreferenced: `server/src/test/unit/debuggingTestRunner.test.js`

**Interfaces:**
- Produces: `getDebuggingRuntimeProfile(runtime)` returning trusted `{ compileScript, runScript }`.
- Produces: `buildDebuggingArchive({ files, runtime }) -> Buffer`.
- Produces: `runDebuggingProject({ files, runtime, includeHiddenTests }) -> normalized result`.
- Consumes `validateDebuggingProject(files)` from Task 1.

- [ ] **Step 1: Write failing runner tests around the Judge0 multi-file contract**

Tests must assert:

```js
expect(mockSubmit).toHaveBeenCalledWith(expect.objectContaining({
  language_id: 89,
  additional_files: expect.any(String),
}));
```

Also unzip/decode the captured archive in the test and assert:

```js
expect(entries).toContain("compile");
expect(entries).toContain("run");
expect(entries).toContain("src/app.js");
expect(entries).toContain("tests/app.test.js");
expect(entries).not.toContain("hidden/secret.test.js");
```

for a visible run, and assert the hidden file is present for `includeHiddenTests: true`.

- [ ] **Step 2: Run the new runner tests and verify RED**

Run:

```bash
npm test -- --run src/test/unit/debuggingProjectRunner.test.js
```

Expected: fail because runtime profiles/archive runner do not exist.

- [ ] **Step 3: Implement trusted runtime profiles**

Use server-owned scripts only. Profiles must be explicit and version-labelled. For V1, generate scripts that assume the Judge0 image already contains the needed runtime/toolchain and never perform network installation. Example Node profile:

```js
"node-22": {
  compileScript: "#!/bin/sh\nset -eu\nnode --check $(find . -name '*.js' -type f | head -n 1)\n",
  runScript: "#!/bin/sh\nset -eu\nnode tests/run-tests.js\n",
}
```

Equivalent Java/Python/C++ profiles must invoke only trusted local tools; if the exact Judge0 installation cannot satisfy a profile, `Validate assignment` must surface that failure and block publish rather than attempting internet setup.

- [ ] **Step 4: Implement ZIP packaging and Judge0 id 89 submission**

`buildDebuggingArchive` must create a ZIP containing normalized project files plus root `compile` and `run`. `runDebuggingProject` must Base64 the ZIP into `additional_files`, submit with `language_id: 89`, reuse existing Judge0 polling/timeouts, and return only normalized status/count/log fields allowed by the caller.

- [ ] **Step 5: Verify hidden diagnostics filtering**

Candidate-visible result shape for final hidden execution must be limited to:

```js
{
  status: "passed" | "failed" | "compile_error" | "runtime_error" | "timeout",
  visiblePassed,
  visibleTotal,
  hiddenPassed,
  hiddenTotal,
  visibleFailures: [{ name, message }],
}
```

No hidden test name, source, expected value, stdout/stderr fragment, or stack trace may be included.

- [ ] **Step 6: Run runner + existing code execution tests**

Run:

```bash
npm test -- --run src/test/unit/debuggingProjectRunner.test.js src/test/unit/runCode.test.js
```

If the existing code-execution test filename differs, use the current runCode unit test path discovered in the repository. Expected: both the new project runner and legacy single-file execution pass.

- [ ] **Step 7: Commit**

```bash
git add server/src/services/debuggingRuntimeProfiles.js server/src/services/debuggingProjectRunner.js server/src/utils/runCode.js server/src/test/unit/debuggingProjectRunner.test.js
git commit -m "feat: execute debugging projects with Judge0 multi-file mode"
```

---

### Task 3: Rewrite recruiter authoring as a browser project workspace

**Files:**
- Create: `client/src/utils/debuggingProject.js`
- Create: `client/src/components/ProjectFileTree.jsx`
- Create: `client/src/components/DebuggingProjectWorkspace.jsx`
- Create: `client/src/__tests__/debuggingProjectWorkspace.test.jsx`
- Modify: `client/src/components/DebuggingRoundEditor.jsx`
- Modify: `client/src/__tests__/debuggingRoundEditor.test.jsx`

**Interfaces:**
- `DebuggingProjectWorkspace({ files, selectedPath, onSelect, onFilesChange, readOnly, allowClassification })`.
- `ProjectFileTree` emits create/rename/delete/select actions; it never owns persisted state.
- `DebuggingRoundEditor` emits a round with `debugging: { responseMode, runtime, entryFile, files }`.

- [ ] **Step 1: Write failing component tests for recruiter file authoring**

Tests must cover:

```jsx
render(<DebuggingProjectWorkspace files={[{ path: "src/app.js", content: "old", kind: "source" }]} onFilesChange={onFilesChange} />);
await user.click(screen.getByRole("button", { name: /new file/i }));
await user.type(screen.getByLabelText(/file path/i), "src/helper.js");
await user.click(screen.getByRole("button", { name: /create/i }));
expect(onFilesChange).toHaveBeenCalledWith(expect.arrayContaining([
  expect.objectContaining({ path: "src/helper.js", kind: "source" }),
]));
```

Add separate tests for rename, delete, folder creation through path prefix, editor content changes, and `kind` switching among `source`, `visible_test`, `hidden_test` when `allowClassification=true`.

- [ ] **Step 2: Run component tests and verify RED**

Run from `client`:

```bash
npm test -- --run src/__tests__/debuggingProjectWorkspace.test.jsx src/__tests__/debuggingRoundEditor.test.jsx
```

Expected: fail because the multi-file workspace components do not exist and `DebuggingRoundEditor` still uses `starterCode/tests`.

- [ ] **Step 3: Implement immutable file-array helpers**

`client/src/utils/debuggingProject.js` must provide deterministic helpers for `createProjectFile`, `renameProjectPath`, `deleteProjectPath`, and `updateProjectFileContent`, preserving normalized slash-separated paths and preventing duplicate visible paths in the UI.

- [ ] **Step 4: Implement `ProjectFileTree` and Monaco workspace shell**

Render nested folders from flat file paths. Editing a selected file updates only that file. In recruiter mode, expose New File, New Folder, Rename, Delete, and classification controls. `hidden_test` files remain visible to the recruiter and carry a lock/private label.

- [ ] **Step 5: Rewrite `DebuggingRoundEditor`**

Remove provisional `starterCode` and stdin/expected-output controls. Render:

```text
Assignment instructions
Candidate response: Fix code | Submit findings
Runtime: Java 21 | Node 22 | Python 3 | C++20
ProjectFileTree + Monaco
File classification
Validate assignment
```

Default project for a new debugging round must contain at least one editable source file appropriate for the selected runtime, e.g. Node `src/index.js`, but no fake tests.

- [ ] **Step 6: Run recruiter workspace tests**

Run:

```bash
npm test -- --run src/__tests__/debuggingProjectWorkspace.test.jsx src/__tests__/debuggingRoundEditor.test.jsx
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add client/src/utils/debuggingProject.js client/src/components/ProjectFileTree.jsx client/src/components/DebuggingProjectWorkspace.jsx client/src/components/DebuggingRoundEditor.jsx client/src/__tests__/debuggingProjectWorkspace.test.jsx client/src/__tests__/debuggingRoundEditor.test.jsx
git commit -m "feat: add recruiter multi-file debugging workspace"
```

---

### Task 4: Add recruiter assignment validation and builder publish gating

**Files:**
- Modify: `server/src/controllers/debuggingAssessmentController.js`
- Modify: `server/src/routes/assessmentRoutes.js`
- Modify: `server/src/test/e2e/debuggingAssessment.test.js`
- Modify: `client/src/components/DebuggingRoundEditor.jsx`
- Modify: `client/src/pages/AssessmentBuilderPage.jsx`
- Modify: `client/src/__tests__/hiringBuilderWiring.test.js`

**Interfaces:**
- `POST /api/assessments/debugging/validate` request: `{ responseMode, runtime, files }`.
- Success response: `{ valid: true, status, visiblePassed, visibleTotal, hiddenPassed, hiddenTotal }`.
- Invalid assignment returns `400` with actionable message.
- Builder stores validation fingerprint/status per debugging round in transient client state; changing runtime/files invalidates prior validation.

- [ ] **Step 1: Add failing API tests for validation**

Test feature-off `503`, path/limit `400`, unsupported runtime `400`, and mocked Judge0 validation success. For `code_fix`, assert validation rejects a starter where all tests already pass:

```js
expect(response.status).toBe(400);
expect(response.body.message).toMatch(/at least one.*fail/i);
```

- [ ] **Step 2: Verify validation tests RED**

Run:

```bash
npm test -- --run src/test/e2e/debuggingAssessment.test.js
```

Expected: new validation cases fail before endpoint implementation.

- [ ] **Step 3: Implement recruiter validation endpoint**

Use `validateDebuggingProject`, then `runDebuggingProject({ includeHiddenTests: true })`. Never echo hidden file content. For findings mode, perform structure/runtime/package validation but do not require tests to fail or execute candidate code.

- [ ] **Step 4: Add failing builder test for validation invalidation and publish gating**

The test must prove changing any file after a successful validation removes the “Validated” status and disables publish until validation is rerun for each debugging round.

- [ ] **Step 5: Implement validation UI and publish gate**

`DebuggingRoundEditor` calls `/assessments/debugging/validate`; `AssessmentBuilderPage` refuses publish/schedule if any debugging round lacks a current successful validation fingerprint. Draft save remains allowed.

- [ ] **Step 6: Run API + builder tests**

Run:

```bash
# server
npm test -- --run src/test/e2e/debuggingAssessment.test.js
# client
npm test -- --run src/__tests__/debuggingRoundEditor.test.jsx src/__tests__/hiringBuilderWiring.test.js
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add server/src/controllers/debuggingAssessmentController.js server/src/routes/assessmentRoutes.js server/src/test/e2e/debuggingAssessment.test.js client/src/components/DebuggingRoundEditor.jsx client/src/pages/AssessmentBuilderPage.jsx client/src/__tests__/hiringBuilderWiring.test.js
git commit -m "feat: validate debugging assignments before publish"
```

---

### Task 5: Implement candidate workspace APIs, autosave overlays, visible runs, and final submission

**Files:**
- Modify: `server/src/controllers/debuggingAssessmentController.js`
- Modify: `server/src/routes/assessmentRoutes.js`
- Modify: `server/src/test/e2e/debuggingAssessment.test.js`

**Interfaces:**
- `GET /api/assessments/public/:shareToken/attempts/:attemptId/debugging/:roundIndex`.
- `PUT /api/assessments/public/:shareToken/attempts/:attemptId/debugging/:roundIndex/workspace`.
- `POST /api/assessments/public/:shareToken/attempts/:attemptId/debugging/:roundIndex/run-tests`.
- `POST /api/assessments/public/:shareToken/attempts/:attemptId/debugging/:roundIndex/submit`.
- All require `x-attempt-token`.

- [ ] **Step 1: Write failing API journey tests for candidate project behavior**

Cases:

1. GET returns source + visible tests and omits hidden tests entirely.
2. PUT accepts changed/created/deleted file overlay and persists it.
3. PUT rejects editing/deleting hidden tests and invalid/traversal paths.
4. Visible run calls `runDebuggingProject` with `includeHiddenTests: false`.
5. Final submit calls it with `includeHiddenTests: true`, persists hidden aggregate and final diff, and marks the debugging response submitted.
6. Findings mode accepts structured findings and does not invoke Judge0.
7. Wrong/missing attempt token returns authorization failure.

- [ ] **Step 2: Verify candidate API tests RED**

Run:

```bash
npm test -- --run src/test/e2e/debuggingAssessment.test.js
```

Expected: failures on the new route shapes because current controller still uses body `roundIndex/questionIndex` and single `code`.

- [ ] **Step 3: Implement round-index context loading and candidate-safe GET**

Read `roundIndex` from URL params, load immutable round snapshot, locate/create `debuggingResponses[roundIndex]`, reconstruct source+visible-test workspace with overlay, and sanitize hidden tests before serialization.

- [ ] **Step 4: Implement overlay autosave PUT**

Validate overlay paths/content and project limits after reconstruction. Persist only candidate overlay, never mutate `Assessment.rounds[].debugging.files`.

- [ ] **Step 5: Implement visible-run endpoint**

Reconstruct candidate workspace, append only visible tests, call `runDebuggingProject(... includeHiddenTests:false)`, append a bounded run summary to `visibleTestRuns`, and return visible diagnostics.

- [ ] **Step 6: Implement final submit endpoint**

For `code_fix`, reconstruct workspace, inject hidden tests server-side, execute final run, persist hidden aggregate + diff summary + timestamp, and return sanitized final summary. For `findings`, validate required structured fields, persist them, set submittedAt, and never invoke Judge0.

- [ ] **Step 7: Run server unit/API suites for debugging**

Run:

```bash
npm test -- --run src/test/unit/debuggingProject.test.js src/test/unit/debuggingProjectRunner.test.js src/test/e2e/debuggingAssessment.test.js
```

Expected: pass with no hidden source/diagnostic leakage assertions failing.

- [ ] **Step 8: Commit**

```bash
git add server/src/controllers/debuggingAssessmentController.js server/src/routes/assessmentRoutes.js server/src/test/e2e/debuggingAssessment.test.js
git commit -m "feat: add candidate debugging project APIs"
```

---

### Task 6: Build candidate code-fix and findings project experiences

**Files:**
- Create: `client/src/components/CandidateDebuggingRound.jsx`
- Create: `client/src/__tests__/candidateDebuggingRound.test.jsx`
- Modify: `client/src/pages/CandidateAssessmentPage.jsx`
- Modify: `client/src/__tests__/candidateAssessment.test.jsx`

**Interfaces:**
- `CandidateDebuggingRound({ shareToken, attemptId, attemptToken, roundIndex, onSubmitted })`.
- Reuses `DebuggingProjectWorkspace` with `readOnly=false` for code-fix and `readOnly=true` for findings.

- [ ] **Step 1: Write failing candidate component tests**

Code-fix tests must prove:

- multi-file GET renders file tree;
- editing two source files and waiting for debounce sends one latest workspace PUT;
- visible test button calls `/run-tests` and renders visible failures;
- reload from server workspace restores saved edits;
- submit calls `/submit` and displays hidden aggregate only;
- no hidden filename/content from mocked backend can be rendered.

Findings tests must prove:

- editor is read-only;
- root cause, evidence, proposed fix, impact/risk, testing strategy fields render;
- submission contains structured findings and no workspace mutation call.

- [ ] **Step 2: Verify candidate tests RED**

Run:

```bash
npm test -- --run src/__tests__/candidateDebuggingRound.test.jsx src/__tests__/candidateAssessment.test.jsx
```

Expected: fail because `CandidateDebuggingRound` and page integration do not exist.

- [ ] **Step 3: Implement candidate project loading and autosave**

Fetch the round workspace on mount. For `code_fix`, keep local file edits immediate and debounce server autosave (~750–1500ms); show `Saving…`, `Saved`, and recoverable error states. Server state remains authoritative after reload.

- [ ] **Step 4: Implement visible run and final submit UX**

Disable duplicate in-flight runs/submits. Visible test output may show visible test names/messages. Final summary may show only aggregate hidden pass counts. After successful submit call `onSubmitted` so the existing round progression can unlock the next round.

- [ ] **Step 5: Implement findings mode**

Use read-only project browser and structured text fields. Keep drafts autosaved through the workspace/response API; submit without Judge0 execution.

- [ ] **Step 6: Wire into `CandidateAssessmentPage`**

When the active round `deliveryMode === "debugging"`, render `CandidateDebuggingRound` instead of conversational/coding/system-design panels. Preserve existing sequential round locking and integrity gates.

- [ ] **Step 7: Run candidate/client suites**

Run:

```bash
npm test -- --run src/__tests__/candidateDebuggingRound.test.jsx src/__tests__/candidateAssessment.test.jsx
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/CandidateDebuggingRound.jsx client/src/pages/CandidateAssessmentPage.jsx client/src/__tests__/candidateDebuggingRound.test.jsx client/src/__tests__/candidateAssessment.test.jsx
git commit -m "feat: add candidate debugging project experience"
```

---

### Task 7: Add recruiter report evidence for debugging projects

**Files:**
- Modify: `client/src/pages/AssessmentReportPage.jsx`
- Modify: `client/src/__tests__/assessmentReportPage.test.jsx`
- Modify: server report serialization path if the report endpoint currently drops `debuggingResponses`.

**Interfaces:**
- Recruiter report receives deterministic debugging evidence only from persisted attempt data.
- Code-fix report shows final diff summary, changed/created/deleted paths, visible pass count, hidden aggregate, compile/runtime status.
- Findings report shows the original structured findings verbatim as evidence.

- [ ] **Step 1: Write failing report tests**

Assert code-fix renders:

```text
Debugging assignment
3 files changed
Visible tests 5/6
Hidden tests 4/5
```

and lists changed paths without hidden test paths. Assert findings mode renders Root cause, Evidence, Proposed fix, Impact / risk, Testing strategy.

- [ ] **Step 2: Verify report tests RED**

Run:

```bash
npm test -- --run src/__tests__/assessmentReportPage.test.jsx
```

Expected: fail because debugging evidence is not yet displayed.

- [ ] **Step 3: Add report serialization and UI**

Do not compute correctness with an LLM when deterministic test results exist. If the existing report AI evaluation includes debugging responses, pass deterministic evidence as context but preserve the actual Judge0 counts separately and visibly.

- [ ] **Step 4: Run report tests**

Run:

```bash
npm test -- --run src/__tests__/assessmentReportPage.test.jsx
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/AssessmentReportPage.jsx client/src/__tests__/assessmentReportPage.test.jsx server/src
git commit -m "feat: report debugging project evidence"
```

---

### Task 8: Add end-to-end regression coverage, documentation, and exact-head verification

**Files:**
- Create: `client/e2e/debuggingAssessment.spec.js`
- Modify: existing env example/documentation files found in repository.
- Modify: `README.md` only if this repository documents feature flags/runtime constraints there.

**Interfaces:**
- Playwright uses mocked API/Judge0 boundaries where CI cannot contact Judge0; server API tests already cover adapter contracts.

- [ ] **Step 1: Add six Playwright journeys required by the spec**

Tests:

1. recruiter enables capability and authors a multi-file code-fix round: creates folder/file, edits two files, marks one visible and one hidden test, validates;
2. recruiter authors findings-only round and publishes without execution controls;
3. candidate edits multiple files, runs visible tests, reloads, resumes exact server-saved project, submits;
4. hidden tests never appear in DOM, network JSON body captured by the test, or candidate file tree;
5. findings candidate can navigate project files but Monaco is read-only and submits structured findings;
6. feature capability false keeps exactly the existing three Format choices and no debugging editor.

- [ ] **Step 2: Run targeted Playwright tests**

Run from `client`:

```bash
npx playwright test e2e/debuggingAssessment.spec.js
```

Expected: all new debugging journeys pass in the projects they are tagged/configured for, with zero accidental skips.

- [ ] **Step 3: Document the feature flag and V1 constraints**

Document exactly:

```env
ENABLE_DEBUGGING_ASSESSMENTS=false
```

and state that project execution is Judge0 multi-file mode, self-contained, no network installs/external services, max 100 files / 256 KB each / 2 MB total.

- [ ] **Step 4: Remove provisional single-file debugging code and tests**

Search branch diff for `starterCode`, `debugCode`, `debugTestResult`, and the provisional stdin/expected-output debugging test model. Any remaining occurrence must either belong to legacy non-debugging coding functionality or be removed/migrated. Delete `debuggingTestRunner.js` and its unit test if no non-project caller remains.

- [ ] **Step 5: Run full server verification**

From `server`:

```bash
npm test
npm run test:api
npm audit --audit-level=high
```

Use the repository's exact API-journey script name if it differs from `test:api`; the CI workflow is authoritative. Expected: all pass.

- [ ] **Step 6: Run full client verification**

From `client`:

```bash
npm run lint
npm test -- --run
npm run build
npm run check:entry-bundle
npm run test:e2e
npm audit --audit-level=critical
```

Expected: lint has no new errors, all unit/component tests pass, build/bundle checks pass, Playwright has zero failures, and audit gate passes.

- [ ] **Step 7: Verify exact GitHub Actions head**

Push the final branch head and inspect the CI run whose `head_sha` exactly equals the current `feature/debugging-assessments` SHA. Required green checks:

```text
server unit tests
server API journeys
server dependency audit
client lint
client unit tests
client build
entry bundle
Playwright
client dependency audit
```

Diagnostic artifact upload is auxiliary; if GitHub storage quota alone causes the workflow to fail after all product gates pass, adjust the workflow so diagnostics upload cannot prevent the dependency audit from running, then rerun exact-head CI. Do not call the branch green while the workflow conclusion is red.

- [ ] **Step 8: Compare against current main before PR**

Fetch current `main`, compare it to `feature/debugging-assessments`, and ensure the branch is not behind or has no merge conflict. If main moved incompatibly, integrate main and rerun exact-head CI.

- [ ] **Step 9: Commit final tests/docs and open PR only after exact-head green**

```bash
git add client/e2e/debuggingAssessment.spec.js README.md .env.example docs
git commit -m "test: cover multi-file debugging assessment flow"
```

Then open a PR from `feature/debugging-assessments` to `main` with a summary of the feature flag, project model, Judge0 multi-file execution, hidden-test boundary, recruiter/candidate UX, and exact-head verification.

---

## Self-review

- Spec coverage: feature gating, recruiter authoring, candidate code-fix/findings, immutable project snapshot, candidate overlay, protected hidden tests, Judge0 id 89, trusted runtime profiles, assignment validation, API shape, report evidence, security limits, migration from provisional single-file code, component/API/Playwright coverage, and exact-head CI are all assigned to explicit tasks.
- Placeholder scan: no TBD/TODO/“similar to” implementation gaps remain; each task states concrete interfaces, tests, commands, and acceptance behavior.
- Type consistency: all tasks use `responseMode`, `runtime`, `entryFile`, `files`, `changedFiles`, `createdFiles`, `deletedFiles`, `findings`, `visibleTestRuns`, and `finalEvaluation` consistently. Candidate routes use URL `roundIndex` consistently. Judge0 project runner consistently uses `language_id: 89` and `includeHiddenTests`.