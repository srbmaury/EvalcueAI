# Real UI E2E findings — 7 October 2026

## Environment and method

Manual browser interactions through Codex computer-use tools against the running app at http://localhost:5173 and its real configured backend. No API mocks, test-route interception, injected auth, fake media streams or direct database edits. A fresh production build preview at http://localhost:4176 used the same backend and saved coding session to isolate a dev-server crash. Used two supplied Practice demo accounts and the demo Hiring owner/reviewer. Local accounts already contained prior QA data. This is a targeted real-UI journey review, not exhaustive coverage of every feature.

## Findings

| ID | Priority | Finding and reproduction | Evidence / scope |
|---|---|---|---|
| UI-01 | High | Existing dev UI crashes when entering a generated coding round: “Cannot read properties of null (reading 'useContext')”. Reload reproduces it. Console reports an invalid hook call at CodeEditorField → MUI useTheme. | coding-crash.png. Same saved round works in a fresh production preview. Dev dependency cache / duplicate React is a hypothesis, not a proven root cause; no production crash established. |
| UI-02 | Medium | Practice Pro shows a disabled “Checkout not configured” button despite displaying ₹699/month. There is no actionable inline explanation of the missing payment setup. Hire has clearer “Payments unavailable” and contact-support messaging. | Actual /practice/pricing and /hire/team. No payment or mandate submitted. |
| UI-03 | Medium, investigation | After authorized mic/camera activation, microphone becomes ready but camera remains “Camera needed”; no visible error or recovery message explains why. The live conversational round cannot reveal its first question. | camera-pending.png. Observed in the in-app browser; hardware or browser compatibility may explain the failure. Do not treat this as proven app-wide camera failure. |
| UI-04 | Medium, quality concern | A coding prompt asks to implement a REST API in Python, but a prose-only answer earns 8/10 and Technical correctness 9/10 without code execution. | real-feedback.png; report preserves prose and marks limited evidence. Text answers are intentionally supported; scoring should distinguish design explanation from demonstrated implementation. One sample only. |
| UI-05 | Low | Final single-round debrief still says to choose when to move to the next interview stage although the only round is completed. | Observed in real completed debrief. Copy should reflect final completion. |
| UI-06 | Local configuration | Google sign-in emits “The given origin is not allowed for the given client ID.” | Console at localhost:5173. Password sign-in works. OAuth account flow was not completed; live-domain behavior not established. |
| UI-07 | Low | Overall interview feedback page has a visual page title rendered as heading level 4, with no H1 in the accessibility tree. | Actual overall feedback page. Improve semantic hierarchy for screen readers. |

## Successful real journeys

- Public homepage navigation and visible legal proprietor name.
- Actual password login and logout using supplied demo accounts.
- Real AI interview-plan generation from the Backend preset.
- Round selection, one-round interview creation, intro submission, and round entry.
- Fresh production preview renders the coding editor, language selector, code/text switch and approach input.
- A 478-character written response survives full reload exactly; answered status persists.
- Real answer submission and AI evaluation complete; round feedback and overall interview report open with preserved answer and evidence.
- Progress analytics load existing completed sessions.
- Hiring owner dashboard, candidate pipeline, team roles, shared usage and INR prices load.
- Existing Hiring candidate report shows introduction, AI evidence and human-review controls. No human hiring decision was changed.
- Candidate preview opens and explicitly states that nothing is saved/scored/counted.
- Reviewer sees candidate-only navigation; direct /hire/team navigation redirects to /hire/assessments#candidate-pipeline without settings/billing controls.
- Practice and Hire registration screens show labeled fields, password guidance, privacy/terms links and gated submit; no account or legal agreement submitted.

## Limits and test data

Two local practice sessions were created through the UI: conversational session 6ac65ccea442f85ceaccb36f (left incomplete at media gate), and coding session 6ac65d28a442f85ceaccb427 (completed via text response). These consume demo practice quota. No production data, payment, email invitation, organization membership, human scorecard decision or account registration was modified. Navigating away released the test microphone. Temporary preview stopped after testing.

Typing tool timed out after 81 characters during a long sequential typing request; the captured prefix matched exactly. The final long answer was filled through the UI and verified after reload. This proves persistence, not sustained fast-keystroke correctness. Camera-dependent interview completion, live system-design discussion, file uploads, invitations/email delivery, actual code execution and PayU renewal remain unverified here.

Mobile resize was requested, but actual window.innerWidth stayed at 1280px; therefore no manual mobile pass is claimed. Automated mobile results from the separate run remain separately documented.

No application fixes or pushes were made in this manual review.
