# Debugging Assessments Design

## Goal

Add a Hiring assessment round that lets organizations evaluate debugging ability in two modes:

1. `code_fix` — candidates edit buggy code in place and run recruiter-authored tests.
2. `findings` — candidates inspect buggy code and submit structured diagnostic findings without modifying code.

The feature is isolated on `feature/debugging-assessments` and is disabled by default behind one server-side environment flag: `ENABLE_DEBUGGING_ASSESSMENTS=true`.

## Scope

V1 is intentionally single-file. It uses EvalcueAI's existing Judge0-backed code execution path rather than introducing a new untrusted multi-file runner. This keeps arbitrary execution outside the API process while still delivering an end-to-end debugging assessment. Multi-file repository artifacts and object storage are a later evolution of the same model.

Supported languages match the existing runner: `javascript`, `python`, `cpp`, and `java`.

## Feature flag

`ENABLE_DEBUGGING_ASSESSMENTS` is the source of truth.

- Recruiter capability endpoint exposes whether debugging rounds are enabled.
- Builder hides the debugging format when disabled.
- Server rejects create/update payloads containing debugging rounds when disabled.
- Candidate endpoints reject debugging execution/save operations when disabled.
- Public assessment payloads expose `capabilities.debuggingAssessments` but never hidden test definitions.

No separate `VITE_*` flag is introduced.

## Assessment model

Extend `Assessment.rounds[].deliveryMode` with `debugging`.

A debugging round has exactly one assignment/question and a `debugging` object:

```js
{
  responseMode: "code_fix" | "findings",
  language: "javascript" | "python" | "cpp" | "java",
  starterCode: string,
  tests: [
    {
      name: string,
      stdin: string,
      expectedOutput: string,
      hidden: boolean
    }
  ]
}
```

Constraints:

- `questionCount` is normalized to `1`.
- `starterCode` is capped at 20,000 characters.
- A `code_fix` round requires at least one test.
- Maximum 12 tests per round.
- Test input/output are capped to 20,000 characters each.
- `findings` mode may omit tests.

The assignment instruction continues to use the existing single question's `text` field.

## Candidate attempt model

Candidate attempts copy the debugging round configuration needed for the UI but never hidden expected outputs.

Each attempt question gains:

```js
{
  debugCode: string,
  debugFindings: {
    rootCause: string,
    evidence: string,
    proposedFix: string,
    testingStrategy: string
  },
  debugTestResult: {
    passed: number,
    total: number,
    visible: [{ name, passed, output }],
    hiddenPassed: number,
    hiddenTotal: number,
    ranAt: Date
  }
}
```

For code-fix mode, `debugCode` initializes from `starterCode`. For findings mode, the code is read-only and only `debugFindings` is editable.

## APIs

### Recruiter capability

`GET /api/assessments/capabilities`

```json
{ "debuggingAssessments": true }
```

### Candidate save

`PUT /api/assessments/public/:shareToken/attempts/:attemptId/debugging`

Requires the candidate attempt token and active round sequence.

Payload:

```json
{
  "roundIndex": 0,
  "questionIndex": 0,
  "code": "...",
  "findings": {
    "rootCause": "...",
    "evidence": "...",
    "proposedFix": "...",
    "testingStrategy": "..."
  }
}
```

Server enforces the configured response mode.

### Candidate test execution

`POST /api/assessments/public/:shareToken/attempts/:attemptId/debugging/run-tests`

Requires both `ENABLE_DEBUGGING_ASSESSMENTS=true` and `ENABLE_CODE_EXEC=true`.

The client sends only candidate code plus round/question indexes. The server reloads the assessment and obtains recruiter-authored tests. Hidden test definitions never leave the server.

Response example:

```json
{
  "passed": 5,
  "total": 7,
  "visible": [
    { "name": "returns zero for empty input", "passed": true, "output": "0" }
  ],
  "hiddenPassed": 3,
  "hiddenTotal": 4
}
```

## Test runner

Refactor the existing Judge0 utility so the HTTP controller and debugging test runner share one `executeCode({ language, code, stdin })` service function.

For each configured test:

1. Execute candidate code in Judge0 with the configured stdin.
2. Normalize stdout by trimming trailing whitespace and CRLF differences.
3. Compare against recruiter `expectedOutput` using the same normalization.
4. Record exact visible-test output only for non-hidden tests.
5. Return only aggregate hidden counts for hidden tests.

Compilation/runtime/provider failures are returned as a retryable execution error rather than being counted as an ordinary failed assertion.

## Recruiter UX

The existing four-step assessment builder remains intact.

When the feature is enabled, Step 2 adds `Debugging assignment` to the round format picker.

Step 3 for a debugging round replaces generic question-generation controls with:

- Assignment instructions
- Response mode selector: `Fix code` / `Submit findings`
- Language selector
- Starter code editor
- For `code_fix`: test editor with name, stdin, expected output, hidden toggle, add/remove controls

AI question generation is not used for debugging rounds in V1.

## Candidate UX

A focused `DebuggingRoundPanel` component is used from `CandidateAssessmentPage`.

`code_fix` mode:

- Instructions
- Monaco code editor initialized with starter code
- Run tests button
- Visible test results plus hidden-test pass count
- Autosave into the existing candidate attempt recovery state
- Continue/save through the dedicated debugging endpoint

`findings` mode:

- Read-only code viewer
- Root cause
- Evidence from code
- Proposed fix
- Testing strategy

The candidate cannot see recruiter expected outputs or hidden-test definitions.

## Evaluation and reporting

V1 does not replace recruiter judgment with AI scoring.

The existing assessment evaluation pipeline continues to evaluate the candidate answer. Debugging evidence is projected into the answer text before evaluation:

- code-fix: candidate patch + deterministic test summary
- findings: structured findings fields

Recruiter reports show the structured debugging response and latest test summary in addition to the existing score/reviewer controls.

## Storage

No new database is introduced in V1.

- MongoDB stores assignment configuration, starter code, test definitions, candidate code, findings, and latest test summary.
- Redis/BullMQ remains unchanged for existing background work.
- Judge0 remains the untrusted execution boundary.

When multi-file repository debugging is added later, immutable repository/test bundles should move to object storage and candidate state should become a patch over an immutable assignment version.

## Security

- Candidate code never executes in the Express process.
- Hidden tests are server-side only.
- Candidate test routes require the hashed attempt-token flow already used for candidate tools.
- Existing rate limits and code-execution quotas apply, with an additional debugging-run quota.
- Server rejects debugging rounds when the feature flag is off.
- Recruiter test payloads are never included in public assessment or public attempt responses.

## Testing

Required coverage:

- Model validation for delivery mode, normalization, response mode, starter code, and test limits.
- Route validation and feature-flag rejection.
- Hidden tests omitted from public payloads.
- Candidate attempts initialize debugging code correctly.
- Findings save only in findings mode.
- Code save/test execution only in code-fix mode.
- Hidden test expected output never appears in API responses.
- Judge0 execution result normalization.
- Builder hides debugging when the flag is disabled and exposes it when enabled.
- Candidate code-fix browser journey.
- Candidate findings browser journey.
- Existing assessment formats remain unchanged when the flag is off.
