# Debugging Assessments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add feature-flagged Hiring debugging rounds with code-fix and findings response modes, deterministic hidden/visible test execution, candidate persistence, and recruiter/candidate UI.

**Architecture:** Extend existing assessment/attempt round schemas with a `debugging` delivery mode and single-file assignment configuration. Reuse the existing Judge0 sandbox through a shared execution service, keep hidden tests server-side, and expose the feature to the builder through a server capability endpoint controlled solely by `ENABLE_DEBUGGING_ASSESSMENTS`.

**Tech Stack:** React 19, MUI, Monaco, Express 5, Zod, Mongoose, Judge0, Playwright, Vitest/Jest-style server tests.

**Spec:** `docs/superpowers/specs/2026-09-12-debugging-assessments-design.md`

## Global Constraints

- `ENABLE_DEBUGGING_ASSESSMENTS` is the single source-of-truth feature flag and defaults off.
- V1 is single-file only; do not add a local execution sandbox or multi-file repository runner.
- Supported languages are exactly `javascript`, `python`, `cpp`, and `java`.
- Hidden tests and hidden expected outputs must never be included in public candidate payloads.
- Candidate code execution continues through Judge0 and never runs in the Express process.
- Debugging rounds always contain exactly one assignment/question.
- No new database or object-storage dependency is introduced in V1.

---

### Task 1: Schema and payload contracts

**Files:**
- Modify: `server/src/models/Assessment.js`
- Modify: `server/src/models/CandidateAttempt.js`
- Modify: `server/src/routes/assessmentRoutes.js`
- Test: `server/src/test/unit/debuggingAssessmentModel.test.js`

**Interfaces:**
- Produces `deliveryMode: "debugging"`.
- Produces `round.debugging` with `responseMode`, `language`, `starterCode`, and `tests`.
- Produces attempt question fields `debugCode`, `debugFindings`, and `debugTestResult`.

- [ ] **Step 1: Write failing model tests**

Cover:

```js
expect(debugRound.deliveryMode).toBe("debugging");
expect(debugRound.questionCount).toBe(1);
expect(debugRound.questions).toHaveLength(1);
expect(() => invalidMode.validateSync()).toThrow();
expect(() => codeFixWithoutTests.validateSync()).toThrow();
```

Also verify max 12 tests and supported language/response-mode enums.

- [ ] **Step 2: Run focused model tests and verify RED**

Run:

```bash
cd server
npm run test:unit -- debuggingAssessmentModel.test.js
```

Expected: failures because `debugging` is not yet a valid delivery mode/configuration.

- [ ] **Step 3: Add Mongoose schemas**

In `Assessment.js`, add:

```js
const debuggingTestSchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 120 },
  stdin: { type: String, maxlength: 20000, default: "" },
  expectedOutput: { type: String, maxlength: 20000, default: "" },
  hidden: { type: Boolean, default: false },
}, { _id: true });

const debuggingRoundSchema = new mongoose.Schema({
  responseMode: { type: String, enum: ["code_fix", "findings"], required: true },
  language: { type: String, enum: ["javascript", "python", "cpp", "java"], required: true },
  starterCode: { type: String, maxlength: 20000, required: true },
  tests: { type: [debuggingTestSchema], default: [], validate: (value) => value.length <= 12 },
}, { _id: false });
```

Extend `deliveryMode` enum and add a validator requiring at least one test for `code_fix`.

Normalize debugging rounds to one question in the existing pre-validation hook.

In `CandidateAttempt.js`, add matching `debugCode`, structured `debugFindings`, and `debugTestResult` fields to `attemptQuestionSchema`, and extend the attempt round delivery enum.

- [ ] **Step 4: Extend Zod request contracts**

In `assessmentRoutes.js`, add `debuggingInput` and make `roundInput` accept it only for `deliveryMode === "debugging"`; force `questionCount` to 1 server-side later rather than trusting the client.

- [ ] **Step 5: Run focused tests and commit**

```bash
npm run test:unit -- debuggingAssessmentModel.test.js
```

Commit:

```bash
git add server/src/models server/src/routes/assessmentRoutes.js server/src/test/unit/debuggingAssessmentModel.test.js
git commit -m "feat: add debugging assessment schemas"
```

---

### Task 2: Shared Judge0 execution service and deterministic test runner

**Files:**
- Modify: `server/src/utils/runCode.js`
- Create: `server/src/services/debuggingTestRunner.js`
- Test: `server/src/test/unit/debuggingTestRunner.test.js`

**Interfaces:**
- Produces `executeCode({ language, code, stdin }) -> Promise<ExecutionResult>`.
- Produces `runDebuggingTests({ language, code, tests }) -> Promise<DebugTestSummary>`.

- [ ] **Step 1: Write failing runner tests**

Mock `executeCode` and verify:

```js
expect(result.passed).toBe(2);
expect(result.total).toBe(3);
expect(result.hiddenPassed).toBe(1);
expect(result.hiddenTotal).toBe(2);
expect(JSON.stringify(result)).not.toContain("secret expected value");
```

Also cover CRLF/trailing-whitespace normalization and provider/compile errors.

- [ ] **Step 2: Verify RED**

```bash
cd server
npm run test:unit -- debuggingTestRunner.test.js
```

- [ ] **Step 3: Refactor `runCode.js`**

Extract the current fetch/Judge0 logic into:

```js
export const executeCode = async ({ language, code, stdin = "" }) => {
  // existing Judge0 behavior, but return the normalized execution object
};
```

Keep the default Express controller as a thin wrapper that converts thrown execution errors into the existing HTTP status/body shape.

- [ ] **Step 4: Implement `debuggingTestRunner.js`**

```js
const normalize = (value) => String(value || "").replace(/\r\n/g, "\n").trimEnd();

export const runDebuggingTests = async ({ language, code, tests }) => {
  // sequentially execute tests, compare normalized stdout, expose full result only for visible tests
};
```

Do not include hidden names, stdin, or expected output in the returned summary.

- [ ] **Step 5: Run tests and commit**

```bash
npm run test:unit -- debuggingTestRunner.test.js
```

Commit:

```bash
git add server/src/utils/runCode.js server/src/services/debuggingTestRunner.js server/src/test/unit/debuggingTestRunner.test.js
git commit -m "feat: add deterministic debugging test runner"
```

---

### Task 3: Feature gate, public sanitization, candidate save and test APIs

**Files:**
- Modify: `server/src/controllers/assessmentController.js`
- Create: `server/src/controllers/debuggingAssessmentController.js`
- Modify: `server/src/routes/assessmentRoutes.js`
- Modify: `server/.env.example`
- Modify: `server/src/test/setupEnv.js`
- Test: `server/src/test/api/debuggingAssessment.test.js`

**Interfaces:**
- Produces `GET /api/assessments/capabilities`.
- Produces `PUT /api/assessments/public/:shareToken/attempts/:attemptId/debugging`.
- Produces `POST /api/assessments/public/:shareToken/attempts/:attemptId/debugging/run-tests`.

- [ ] **Step 1: Write API tests first**

Cover:

```js
GET /api/assessments/capabilities -> { debuggingAssessments: false }
```

when the flag is off; verify create/update with a debugging round is rejected.

With the flag on, verify public payloads contain starter code and response mode but not hidden tests/expected outputs.

Verify candidate code-fix attempts initialize `debugCode` from starter code.

Verify findings save is rejected for `code_fix` and code save/test execution is rejected for `findings`.

Verify hidden expected outputs never appear in the run-tests response.

- [ ] **Step 2: Run API tests and verify RED**

```bash
cd server
npm run test:e2e -- debuggingAssessment.test.js
```

- [ ] **Step 3: Add server capability and flag enforcement**

Add:

```js
export const debuggingAssessmentsEnabled = () =>
  (process.env.ENABLE_DEBUGGING_ASSESSMENTS || "false").toLowerCase() === "true";
```

Expose it through `/assessments/capabilities` after organization auth.

Reject debugging create/update payloads when disabled.

- [ ] **Step 4: Sanitize public payloads**

Public assessment debugging rounds may expose:

```js
{
  responseMode,
  language,
  starterCode,
  visibleTestCount,
  hiddenTestCount,
}
```

Do not expose recruiter test definitions.

Public attempt payload exposes candidate `debugCode`, `debugFindings`, and aggregate `debugTestResult` only.

- [ ] **Step 5: Implement candidate endpoints**

`saveCandidateDebuggingResponse` reloads the assessment, verifies round indexes/mode, checks attempt token, updates the structured response, and saves.

`runCandidateDebuggingTests` verifies `code_fix`, calls `runDebuggingTests`, stores the aggregate result, and returns the sanitized summary.

- [ ] **Step 6: Add env defaults**

In `.env.example`:

```env
ENABLE_DEBUGGING_ASSESSMENTS=false
```

In test setup default to false; individual tests explicitly enable it.

- [ ] **Step 7: Run API tests and commit**

```bash
npm run test:e2e -- debuggingAssessment.test.js
```

Commit:

```bash
git add server
git commit -m "feat: add debugging assessment APIs"
```

---

### Task 4: Recruiter builder UX

**Files:**
- Create: `client/src/components/DebuggingRoundEditor.jsx`
- Modify: `client/src/pages/AssessmentBuilderPage.jsx`
- Modify: `client/src/utils/hiringAssessmentPayload.js`
- Test: `client/src/__tests__/debuggingRoundEditor.test.jsx`
- Test: `client/src/__tests__/assessmentBuilderDebugging.test.jsx`

**Interfaces:**
- Consumes `/assessments/capabilities`.
- Produces builder round payload with `deliveryMode: "debugging"` and `debugging` configuration.

- [ ] **Step 1: Write failing UI tests**

Verify the debugging format is absent when capability is false and present when true.

Verify selecting debugging creates one assignment question and opens response-mode/language/starter-code/test controls.

Verify findings mode hides test controls.

- [ ] **Step 2: Run focused client tests and verify RED**

```bash
cd client
npm test -- --run debuggingRoundEditor assessmentBuilderDebugging
```

- [ ] **Step 3: Implement focused editor component**

`DebuggingRoundEditor` receives:

```js
{
  round,
  onChange,
}
```

It renders assignment instructions, response mode, language, Monaco code editor, and test rows for `code_fix`.

- [ ] **Step 4: Wire capability into builder**

Fetch `/assessments/capabilities` once the organization is known. Add `Debugging assignment` to the format menu only when enabled.

Update `emptyRound`, `experienceNames`, step validation, save normalization, and summary copy for debugging rounds.

Do not call AI question generation for debugging rounds.

- [ ] **Step 5: Preserve debugging payload**

Update `buildEditableAssessmentPayload` so the round's `debugging` object survives create/edit.

- [ ] **Step 6: Run tests and commit**

```bash
npm test -- --run debuggingRoundEditor assessmentBuilderDebugging
```

Commit:

```bash
git add client/src/components/DebuggingRoundEditor.jsx client/src/pages/AssessmentBuilderPage.jsx client/src/utils/hiringAssessmentPayload.js client/src/__tests__
git commit -m "feat: add debugging round builder"
```

---

### Task 5: Candidate debugging workspace and recovery

**Files:**
- Create: `client/src/components/DebuggingRoundPanel.jsx`
- Modify: `client/src/pages/CandidateAssessmentPage.jsx`
- Modify: `client/src/utils/candidateAssessmentProgress.js`
- Test: `client/src/__tests__/debuggingRoundPanel.test.jsx`
- Test: `client/e2e/debuggingAssessment.spec.js`

**Interfaces:**
- Consumes candidate debugging fields from public attempt payload.
- Calls dedicated debugging save and run-test APIs with `X-Attempt-Token`.

- [ ] **Step 1: Write failing component and E2E tests**

Component tests cover code-fix and findings rendering.

Playwright covers:

```text
code_fix: start -> edit code -> run tests -> see visible/hidden summary -> save/continue
findings: start -> read code -> enter four findings -> save/continue
```

Also verify the browser never receives hidden expected-output text.

- [ ] **Step 2: Verify RED**

```bash
cd client
npm test -- --run debuggingRoundPanel
npx playwright test e2e/debuggingAssessment.spec.js --project=desktop-chromium
```

- [ ] **Step 3: Implement `DebuggingRoundPanel`**

Code-fix mode uses `CodeEditorField`, has a `Run tests` action, displays visible results and hidden pass count, and reports updates upward.

Findings mode uses a read-only code viewer plus four structured text fields.

- [ ] **Step 4: Integrate into candidate page**

When `round.deliveryMode === "debugging"`, render `DebuggingRoundPanel` instead of conversational/coding/system-design controls.

Persist candidate debugging state into the existing local attempt snapshot and save through the dedicated endpoint before advancing.

- [ ] **Step 5: Update progress logic**

A code-fix response is complete when non-empty candidate code is saved; findings mode is complete when `rootCause` and `proposedFix` are non-empty. Keep submission review semantics consistent with other round types.

- [ ] **Step 6: Run tests and commit**

```bash
npm test -- --run debuggingRoundPanel
npx playwright test e2e/debuggingAssessment.spec.js --project=desktop-chromium
```

Commit:

```bash
git add client/src/components/DebuggingRoundPanel.jsx client/src/pages/CandidateAssessmentPage.jsx client/src/utils/candidateAssessmentProgress.js client/src/__tests__ client/e2e/debuggingAssessment.spec.js
git commit -m "feat: add candidate debugging workspace"
```

---

### Task 6: Evaluation projection and recruiter report

**Files:**
- Modify: `server/src/queues/workers/candidateAssessment.js`
- Modify: `server/src/controllers/assessmentController.js`
- Modify: `client/src/pages/AssessmentReportPage.jsx`
- Test: `server/src/test/unit/candidateDebuggingEvaluation.test.js`
- Test: `client/src/__tests__/assessmentReportDebugging.test.jsx`

**Interfaces:**
- Converts structured debugging evidence into the existing evaluation input.
- Exposes structured debugging evidence in recruiter report data/UI.

- [ ] **Step 1: Write failing tests**

For code-fix, evaluation input must include candidate code and deterministic test summary.

For findings, evaluation input must include the four structured fields.

Recruiter report must show response mode, code/findings, and latest test summary without hidden definitions.

- [ ] **Step 2: Verify RED**

```bash
cd server && npm run test:unit -- candidateDebuggingEvaluation.test.js
cd ../client && npm test -- --run assessmentReportDebugging
```

- [ ] **Step 3: Implement evaluation projection**

Create a small helper inside the worker or a focused utility that returns a textual evidence block from debugging fields before the existing evaluation prompt is built.

- [ ] **Step 4: Render recruiter evidence**

Add a debugging-specific evidence section to the attempt report. Show code, structured findings, visible test names/results, and hidden pass counts only.

- [ ] **Step 5: Run tests and commit**

```bash
cd server && npm run test:unit -- candidateDebuggingEvaluation.test.js
cd ../client && npm test -- --run assessmentReportDebugging
```

Commit:

```bash
git add server/src/queues/workers/candidateAssessment.js server/src/controllers/assessmentController.js server/src/test/unit/candidateDebuggingEvaluation.test.js client/src/pages/AssessmentReportPage.jsx client/src/__tests__/assessmentReportDebugging.test.jsx
git commit -m "feat: report debugging assessment evidence"
```

---

### Task 7: Regression, flag-off safety, docs, and final verification

**Files:**
- Modify: `README.md`
- Modify: `RUNBOOK.md`
- Modify: `client/e2e/debuggingAssessment.spec.js`
- Modify: `.github/workflows/ci.yml` only if test-environment flag setup is required; do not enable the production feature by default.

**Interfaces:**
- Final user-visible contract and production operations documentation.

- [ ] **Step 1: Add flag-off regression coverage**

Verify existing conversational, coding, and system-design builder/candidate journeys behave identically when `ENABLE_DEBUGGING_ASSESSMENTS=false`.

- [ ] **Step 2: Document the feature**

Add the flag and V1 limitations to README/RUNBOOK:

```text
ENABLE_DEBUGGING_ASSESSMENTS=false
```

Document that code-fix mode also requires `ENABLE_CODE_EXEC=true` and Judge0 credentials.

- [ ] **Step 3: Run full server verification**

```bash
cd server
npm run test:unit
npm run test:e2e
npm run audit
```

Expected: zero test failures and audit gate success.

- [ ] **Step 4: Run full client verification**

```bash
cd client
npm run lint
npm test -- --run
npm run build
npm run check:entry-bundle
npm run test:e2e
```

Expected: zero lint/test/build/E2E failures.

- [ ] **Step 5: Inspect branch diff**

```bash
git diff main...HEAD --stat
git diff main...HEAD
```

Confirm no production flag was enabled and no hidden test material is present in candidate-facing fixtures/responses.

- [ ] **Step 6: Commit documentation/final regression updates**

```bash
git add README.md RUNBOOK.md client/e2e/debuggingAssessment.spec.js
git commit -m "docs: document debugging assessments"
```

- [ ] **Step 7: Push and validate exact-head CI**

Only create a PR after exact-head GitHub Actions client and server jobs are green.
