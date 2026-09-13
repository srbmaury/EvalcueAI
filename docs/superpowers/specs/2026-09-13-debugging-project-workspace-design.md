# Debugging Project Workspace Design

Date: 2026-09-13
Branch: `feature/debugging-assessments`
Feature flag: `ENABLE_DEBUGGING_ASSESSMENTS`

## Goal

Add a recruiter-authored debugging assessment round that behaves like a lightweight HackerRank project workspace rather than a single-file coding question.

Recruiters create a multi-file project directly in EvalCueAI, define the assignment instructions and tests, and choose one of two candidate response modes:

- `code_fix`: candidate edits project files, runs visible tests, and submits a final patch that is verified against visible + hidden tests.
- `findings`: candidate reads the project and submits structured debugging findings without modifying or executing the code.

The existing coding-question flow remains unchanged.

## Non-goals for V1

- GitHub repository import
- Arbitrary Docker Compose / multi-service projects
- Internet access during candidate execution
- Database/Redis/Kafka-backed project environments
- Custom recruiter-controlled shell commands
- Full cloud IDE terminals
- A new execution cluster replacing Judge0

## Feature gating

The entire feature is server-gated by:

```env
ENABLE_DEBUGGING_ASSESSMENTS=false
```

When disabled:

- the builder exposes only the existing round formats;
- debugging-round creation/update APIs reject debugging payloads;
- candidate debugging endpoints reject access;
- existing assessments behave exactly as they do today.

The client reads the capability through `/api/assessments/capabilities` and does not use a separately trusted client-side flag.

## Recruiter flow

1. Recruiter creates or edits an assessment.
2. Recruiter adds a round and selects **Debugging assignment**.
3. Recruiter chooses response mode:
   - Fix code
   - Submit findings
4. Recruiter writes candidate instructions directly in the builder.
5. Recruiter creates the project structure in a browser workspace:
   - create file
   - create folder
   - rename file/folder
   - delete file/folder
   - edit file contents in Monaco
6. Recruiter marks files as either:
   - starter/project file
   - visible test
   - hidden test
7. Recruiter selects runtime/language profile.
8. Recruiter validates the assignment before publish.
9. Assessment is published through the existing Hiring flow.

Upload/import is not required. A future release may add ZIP or GitHub import as convenience only.

## Candidate flow

### Code-fix mode

1. Candidate starts the assessment through the existing invitation/share-token flow.
2. When the debugging round unlocks, the candidate sees:
   - assignment instructions
   - file tree
   - Monaco editor
   - visible test runner
   - autosave status
3. Candidate may edit starter files and create/delete non-protected project files.
4. Candidate cannot see or modify hidden test files.
5. **Run tests** executes only visible tests during the working session.
6. **Submit** freezes the current workspace and runs visible + hidden tests server-side.
7. Hidden-test names, source, expected values, stdout/stderr, and per-test diagnostics never reach the candidate.
8. The recruiter report receives the final diff, visible-test results, hidden-test aggregate, and evaluation evidence.

### Findings mode

1. Candidate receives a read-only multi-file project browser.
2. Candidate submits structured fields:
   - root cause
   - evidence
   - proposed fix
   - impact/risk
   - testing strategy
3. No code execution is required.

## Project data model

The existing `Assessment.rounds[]` gains `deliveryMode: "debugging"`.

A debugging round stores an immutable authored project snapshot inside the round version used by the assessment.

V1 shape:

```js
{
  deliveryMode: "debugging",
  name: "Debugging",
  description: "...",
  questionCount: 1,
  questions: [
    { text: "Candidate-facing assignment instructions", required: true }
  ],
  debugging: {
    responseMode: "code_fix" | "findings",
    runtime: "java-21" | "node-22" | "python-3" | "cpp-20",
    entryFile: "src/...", // optional display preference
    files: [
      {
        path: "src/main/java/.../OrderService.java",
        content: "...",
        kind: "source" | "visible_test" | "hidden_test"
      }
    ]
  }
}
```

V1 deliberately stores authored project files in MongoDB because the recruiter edits them directly and we can enforce tight project limits. This avoids adding object-storage infrastructure before it is needed.

Limits for V1:

- max 100 files
- max 256 KB per file
- max 2 MB total project source
- UTF-8 text files only
- normalized relative paths only
- no symlinks
- no absolute paths
- no `..` traversal segments

If real usage requires larger projects, authored snapshots can later move to object storage without changing the candidate/workspace API contract.

## Candidate workspace persistence

Candidate work is stored separately from the immutable recruiter snapshot.

```js
CandidateAttempt.debuggingResponses[] = {
  roundIndex,
  responseMode,
  baseProjectFingerprint,
  changedFiles: [
    { path, content }
  ],
  createdFiles: [
    { path, content }
  ],
  deletedFiles: [path],
  findings: {
    rootCause,
    evidence,
    proposedFix,
    impact,
    testingStrategy
  },
  visibleTestRuns: [...],
  finalEvaluation: {...},
  submittedAt
}
```

The server reconstructs the candidate workspace as:

`immutable starter snapshot + candidate overlay`.

This preserves a clean recruiter-visible diff and prevents candidate edits from mutating the authored assignment.

## Protected files

Files with `kind: "hidden_test"` are never serialized into candidate-facing assessment payloads.

For code-fix mode:

- source files are editable;
- visible tests are readable and may be configured as read-only in V1;
- hidden tests are completely absent from candidate payloads;
- server reconstruction injects hidden tests only immediately before final Judge0 execution.

## Judge0 execution architecture

Existing single-question coding continues to use the existing Judge0 path.

Debugging projects use a dedicated multi-file adapter built on Judge0 multi-file submissions.

Server flow:

1. Load immutable debugging project snapshot.
2. Apply candidate overlay.
3. Select files for the execution type:
   - working-session run: source + visible tests
   - final submission: source + visible tests + hidden tests
4. Generate trusted EvalCueAI-owned `compile` and `run` scripts from the selected runtime profile.
5. Package the project into an in-memory ZIP archive.
6. Base64 encode the archive.
7. Submit through Judge0 multi-file mode (`language_id: 89`).
8. Poll Judge0 through the existing execution abstraction.
9. Parse the test-runner result into a normalized EvalCueAI result.

Recruiters do **not** provide shell scripts. Runtime profiles map to trusted commands owned by EvalCueAI.

Example profiles:

### Java / Maven

- project must include `pom.xml` or Maven wrapper as supported by the configured Judge0 image;
- EvalCueAI controls the compile/run command;
- JUnit output is normalized by the server.

### Node

- project must use supported built-in/runtime dependencies available in the execution environment;
- no network package installation during execution.

### Python

- pytest/unittest project structure within the authored files;
- no network package installation.

### C++

- source/project files compiled through the trusted profile;
- test harness included in visible/hidden test files.

## Dependency constraint

V1 projects must be self-contained with respect to the Judge0 environment.

No candidate execution may depend on:

- downloading packages from the internet;
- external databases;
- Redis;
- Kafka;
- Docker-in-Docker;
- external APIs.

If Judge0 cannot provide an expected dependency, the assignment validator must reject the project before publish.

## Assignment validation

Before a debugging round can be published, the recruiter must be able to run **Validate assignment**.

Validation checks:

1. project paths and limits are valid;
2. runtime profile is supported;
3. project can be packaged;
4. compile/test command starts successfully in Judge0;
5. tests can execute;
6. at least one visible or hidden test fails against the buggy starter project for `code_fix` mode.

The builder shows validation output, but hidden-test source remains private.

A future release may support a reference-solution snapshot and require it to pass every test before publish. It is not required for the first implementation.

## API shape

Recruiter-facing assessment create/update continues through the existing assessment APIs; the debugging payload is embedded in the round.

Additional candidate/runtime APIs:

```text
GET  /api/assessments/public/:shareToken/attempts/:attemptId/debugging/:roundIndex
PUT  /api/assessments/public/:shareToken/attempts/:attemptId/debugging/:roundIndex/workspace
POST /api/assessments/public/:shareToken/attempts/:attemptId/debugging/:roundIndex/run-tests
POST /api/assessments/public/:shareToken/attempts/:attemptId/debugging/:roundIndex/submit
```

Recruiter validation:

```text
POST /api/assessments/debugging/validate
```

All attempt endpoints use the existing attempt-token authentication boundary.

## Builder UI

The generic question editor is replaced by a debugging-specific editor whenever `deliveryMode === "debugging"`.

Layout:

```text
Assignment instructions
Response mode
Runtime

Files                 Editor
├─ src/               ...
│  ├─ ...
│  └─ ...
├─ tests/
│  └─ visible...
└─ hidden-tests/      recruiter only

[+ File] [+ Folder]

[Validate assignment]
```

File-tree operations must update the in-memory form state and participate in the existing local-draft recovery flow.

## Candidate UI

Code-fix layout:

```text
Instructions

Files                 Monaco editor

Test output

[Run visible tests]                  [Submit solution]
```

Findings layout:

```text
Instructions

Files                 Read-only Monaco viewer

Root cause
Evidence
Proposed fix
Impact / risk
Testing strategy

[Submit findings]
```

Candidate autosave uses the existing assessment attempt flow. The browser may keep a recovery copy, but server state is authoritative.

## Evaluation and reporting

Code-fix mode produces deterministic evidence first:

- visible tests passed/failed;
- hidden tests passed/failed aggregate;
- compile/runtime status;
- final candidate diff;
- changed/created/deleted file counts.

AI/human evaluation may additionally assess:

- root-cause understanding;
- code quality;
- scope of change;
- regression risk;
- explanation quality.

Deterministic test results must never be replaced by an LLM judgment.

Findings mode evaluates the structured response against the recruiter rubric and retains the original response as evidence.

## Security boundaries

- hidden tests never enter browser payloads;
- project paths are normalized and validated server-side;
- project size/file-count limits are enforced both on save and execution;
- recruiter-authored content cannot provide arbitrary execution shell commands;
- candidate code never executes in the EvalCueAI API process;
- Judge0 remains the untrusted-code execution boundary for V1;
- execution inherits existing Judge0 CPU/memory/time/process/network restrictions;
- attempt-token authorization is required for candidate workspace actions;
- organization authorization remains required for recruiter authoring/validation.

## Migration from current branch implementation

The current branch's single-file fields:

```js
starterCode: "..."
tests: [{ stdin, expectedOutput, hidden }]
```

are considered provisional and will be replaced by the project-file model before the feature is merged.

The existing `DebuggingRoundEditor` will be rewritten as a project workspace rather than extended with more single-file controls.

The existing Judge0 single-file abstraction remains for normal coding rounds; debugging rounds get a separate multi-file packaging adapter.

## Testing strategy

### Server unit tests

- feature flag off rejects debugging round creation/use;
- project path normalization/traversal rejection;
- file-count/size limits;
- hidden-test sanitization;
- candidate overlay application;
- project archive construction;
- trusted runtime-profile command generation;
- visible-run packaging excludes hidden tests;
- final-run packaging includes hidden tests;
- hidden diagnostics never appear in candidate response.

### API journey tests

- recruiter creates debugging round with project files;
- disabled feature rejects it;
- candidate fetch excludes hidden files;
- candidate autosaves file changes;
- visible run executes through mocked Judge0 multi-file path;
- final submit executes hidden tests and persists aggregate;
- findings mode saves/submits without execution.

### Client component tests

- fourth builder format appears only when capability enabled;
- recruiter file/folder CRUD;
- recruiter hidden/visible test classification;
- runtime selection;
- validation status rendering;
- candidate file tree/editor behavior;
- findings mode read-only behavior;
- autosave/recovery.

### Playwright

At minimum:

1. recruiter authors a multi-file code-fix debugging round in place;
2. recruiter authors a findings-only debugging round;
3. candidate edits multiple files, runs visible tests, reloads, resumes, submits;
4. hidden tests never appear in network/UI;
5. findings candidate can inspect files but cannot edit them;
6. feature flag off preserves the current three-format product.

## Delivery strategy

All work remains on `feature/debugging-assessments` until exact-head CI is green.

No PR will be opened until:

- server unit tests pass;
- server API journeys pass;
- client lint passes;
- client unit/component tests pass;
- client build and entry-bundle checks pass;
- Playwright regression suite passes;
- dependency audits pass.
