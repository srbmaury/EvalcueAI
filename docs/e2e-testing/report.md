# EvalcueAI — Browser E2E Test Report

- **Date:** 2026-10-04
- **Branch:** `fix/candidate-answer-typing-crash`
- **Environment:** local dev — API `http://localhost:5000` (NODE_ENV=development, CAPTCHA bypassed), client Vite `http://localhost:5173` (all surfaces), MongoDB Atlas dev DB `test`, Redis local, Brevo email live, code execution disabled, debugging assessments disabled.
- **Accounts:** pre-seeded demo accounts (`*@srbmaury.com`, see `server/companionai_demo_accounts_manifest.json`). No additional seeding was needed at start.

Legend: ✅ pass · ⚠️ pass with issues · ❌ fail · ⏭️ skipped

## Scenarios

| # | Area | Scenario | Result | Notes |
|---|------|----------|--------|-------|
| 1 | Setup | Existing browser session → `/` | ⚠️ | Signed-in Hiring Owner hitting `/` lands on **Practice** dashboard, not Hire (see U1) |
| 2 | Public | Landing page renders, header/footer nav, CTAs | ✅ | No console errors |
| 3 | Public | 17 top-level public routes render with correct H1 | ✅ | `/practice`, `/hire`, `/plans`, `/docs`, `/about`, SEO pages, legal, forgot-password |
| 4 | Public | 21 deep content links (interview-questions, system-design, docs, resources) | ✅ | All resolve with H1 |
| 5 | Public | Unknown route `/this-does-not-exist`, bad slug `/interview-questions/rate-limiter` | ⚠️ | Silently redirects to `/` — no 404 page (U2) |
| 6 | Public | `/debugging-interview-practice` with debugging flag off | ✅ | Redirects to `/` as designed |
| 7 | Public | Mobile 390px: 9 key pages checked for horizontal overflow | ✅ | No overflow |
| 8 | Public | Pricing page | ✅ | Minor presentation notes (U3) |
| 9 | Auth | Protected routes logged out (`/practice/dashboard`, `/hire/assessments`, `/admin`) | ✅ | Redirect to product-specific login |
| 10 | Auth | Empty login submit | ✅ | Inline "Email/Password is required" |
| 11 | Auth | Wrong password | ✅ | Generic "Invalid email or password" alert |
| 12 | Auth | Login from deep link `/practice/progress` | ✅ | Returns to the deep-linked page after sign-in |
| 13 | Auth | Sign out from avatar menu | ✅ | |
| 14 | Practice | Progress page, empty state | ⚠️ | No CTA in empty state (U5) |
| 15 | Practice | New practice → Backend preset → AI plan generation (~10s) | ✅ | 4 rounds: coding, live system design, 2 conversational |
| 16 | Practice | Create interview from plan | ✅ | Lands on round overview |
| 17 | Practice | Pre-round intro (293 chars typed fast) | ✅ | No dropped characters; Continue enables |
| 18 | Practice | OA problem 1: Monaco editor typing incl. auto-closing brackets | ✅ | Content intact |
| 19 | Practice | OA "Run" with `ENABLE_CODE_EXEC=false` | ❌ | `/api/run-code` → 503, **nothing shown to the user** (B1) |
| 20 | Practice | OA problem 2 plain-text answer | ❌ | **Characters dropped and persisted** (B2) |
| 21 | Practice | OA "Explain your approach" field | ❌ | Characters dropped and persisted (B2) |
| 22 | Practice | Same plain-text field, 110 chars | ✅ | 110/110 — not every field/state loses characters; see B2 table |
| 23 | Practice | Autosave across full page reload mid-round | ✅ | Both answers + code restored, "2/2 answered" |
| 24 | Practice | Switch problem 2 → 1 | ❌ | **Microphone auto-starts, no control to stop it** (B3) |
| 25 | Practice | Webcam during OA round | ⚠️ | Started without a click, labeled "Required" in personal practice; released after round (B4) |
| 26 | Practice | Finish coding round → AI feedback (~10s) | ✅ | Round score, per-question scores, evidence, suggestions, "Retry weak question" |
| 27 | Practice | Live system design: Excalidraw draw rectangle/arrow | ✅ | |
| 28 | Practice | System design typed reply (365 chars) | ✅ (re-checked) | First run: no reply because the Chrome window was occluded (`document.hidden=true`) and `checkpoint` skips hidden tabs. Re-check (#44–45) with the tab treated as visible: reply in ~10s |
| 29 | Practice | End discussion → system design evaluation | ✅ | Score, improvements, transcript |
| 30 | Practice | Conversational round: question tailored to intro, adaptive follow-up | ✅ | Follow-up picked up "60s TTL" detail |
| 31 | Practice | Conversational answer (394 chars) | ❌ | 387/394 (B2) |
| 32 | Practice | End round confirm dialog → feedback | ✅ | Copy mismatch (U10) |
| 33 | Practice | Skip Round (deletes last round) → interview completes | ⚠️ | Lands on **Round 1's** debrief with stale "Continue to Distributed Systems…" CTA for a finished round (B6) |
| 34 | Practice | `/practice/interviews/:id/feedback` overall report | ✅ | 5.2/10, strongest/focus round, per-round sections |
| 35 | Practice | Dashboard + Progress after completion | ✅ | Completed 1, avg 5.2, skills by round (weakest first) |
| 36 | Practice | Profile → set target role → Save | ✅ | "Profile saved" toast |
| 37 | Practice | Resume library: consent → upload PDF | ✅ | Card appears; `/api/resumes?limit=1` fetched 4× on load |
| 38 | Practice | AI resume review vs JD | ✅ | ATS fit, strengths, gaps, keywords. Target role not prefilled from profile (U12) |
| 39 | Practice | Typing control test (plain textarea vs app fields) | ✅ | Proves the drops are app-side (B2) |
| 40 | Hire | Owner sign-in at `/hire/login` → hiring workspace | ✅ | Pipeline, KPIs, pre-seeded assessment |
| 41 | Hire | Create assessment wizard: role → plan → AI questions → launch → publish | ✅ | Stale local draft auto-restored without asking; "Discard local changes" wipes instantly with no confirm (U14) |
| 42 | Hire | Invite candidates by email | ⏭️ | Skipped: sends real email via Brevo. Needs explicit OK |
| 43 | Hire | Candidate shareable link → identity + consent → start → intro | ✅ | Start takes ~8s behind a bare spinner. In the first attempt the page moved past the intro while testing was paused (unconfirmed whether a person clicked) and the mic went live unprompted (B3 applies to Hire candidates too) |
| 44 | Hire | **Re-check:** live system-design round as candidate, typed clarifying reply | ✅ | `POST …/system-design/checkpoint → 200`, interviewer replied in ~10s. It ignored the clarifying question ("what scale should I assume?") and later asked about persistence I'd already described |
| 45 | Hire | **Re-check:** send while tab hidden, then make visible | ✅ | No request while hidden; a periodic checkpoint fired within ~10s of becoming visible and the interviewer answered. Delayed, not lost (B5 downgraded) |
| 46 | Practice | Second practice plan (Backend preset) | ⚠️ | This time "Distributed Systems" came back as a **Conversation** round, not live design. Round formats aren't stable between generations; check the format chip before creating |

## Fix status (2026-10-04)

| Bug | Status | Change |
|---|---|---|
| B1 Run failures silent | ✅ Fixed | `CodeEditorField`: failed runs show "Run failed" plus the reason (503 → "Code execution is unavailable right now…"); reads the server's `message`; `canRun` now actually hides Run/stdin/shortcuts and defaults to the server's `features.codeExecution`. Tests: `codeEditorRunFailures.test.jsx` |
| B2 Dropped characters | ➖ Not a product bug | Replay at controlled speeds: characters are lost only when keystrokes arrive back-to-back in the same task (0 ms apart, how the browser automation types at ~650 chars/s). At ≥1 ms between characters, every run matched exactly. Human typing, dictation and paste aren't affected |
| B3 Mic auto-starts | ➖ By design | Product decision: mic and camera stay on for the whole interview (enforced by `practiceInterviewMediaEnforcement.spec.js`). No change |
| B4 Webcam auto-starts in Practice | ➖ By design | Same decision as B3. No change |
| B5 Hidden-tab send delayed | ✅ Fixed | `useSystemDesignDiscussion`: a forced check that can't run (hidden tab, request in flight, interviewer speaking) is retried as forced on the next tick or on `visibilitychange`. Tests: `useSystemDesignDiscussionPendingSend.test.js` |
| B6 Skip last round → Round 1 debrief | ✅ Fixed | After a skip, select the first unfinished round (or the last round); "Continue to …" only offers unfinished rounds; when all are done, the debrief shows **View interview feedback** |
| B7 Prep label vs bar | ✅ Fixed (likely cause) | Progress bar keyed by variant so the switch to determinate doesn't animate from the indeterminate position |
| B8 AI limit hit mid-interview | ✅ Fixed | `/api/questions` split: autosave has no AI limit; answer/follow-up/complete/checkpoint use `AI_TURN_RATE_LIMIT_MAX` (default 150 / 15 min); prepare/clarify keep the 30 / 15 min limit. OA autosave failures now show one warning per round. Tests: `questionRouteLimits.test.js` |

## Bugs found

### B1 — Code "Run" failures are silent (High)
- **Repro:** Practice OA coding problem → Run (or F9) with code execution disabled. `POST /api/run-code` → `503 {"message":"Feature disabled"}`. Output box stays empty; no toast.
- **Cause:** [CodeEditorField.jsx:188-192](../../client/src/components/CodeEditorField.jsx) — `outputValue` only falls back to `runError` when `execMeta?.isError`; on a failed request `execMeta` is `null`, so the error is swallowed. The catch also reads `err.response.data.error`, but the server sends `message`.
- **Also:** Practice path ([OAForm.jsx:211](../../client/src/components/OAForm.jsx), [ConversationalPanel.jsx:385](../../client/src/components/ConversationalPanel.jsx)) never passes `canRun`, so Run is offered even when the server reports `codeExecution: false` (the candidate page already does this correctly).

### B2 — Burst input drops characters in several controlled text fields (Medium — data integrity; real-user reach unconfirmed)
- **What was seen:** answers saved and graded with missing characters — OA SQL answer ("access_**evel**", "**avod**", "is **ever** string-concatenated" — "never" lost a letter and flipped meaning), OA "Explain your approach" ("**ad** auth", "idempotency **ey** header"), conversational answer ("Redis **rad**-through", "on **wite**"). The AI grader then penalized "spelling errors" the user never typed.
- **Measured repro:** the same 394-char string typed by the browser automation into:
  | Field | Result |
  |---|---|
  | Plain injected `<textarea>` (control, same page) | 394/394 ✅ |
  | Pre-round intro textarea | 293/293 ✅ |
  | System-design chat composer | 365/365 ✅ |
  | Conversational answer box (Practice) | **387/394** ❌ |
  | Resume-review Job description (Practice) | **387/394** ❌ |
- Missing characters were at **identical positions (53, 106, 160, 212, 265, 318, 371)** in two different components on two different pages. So it is deterministic by character count, not by time: the automation tool sends text in ~53-char bursts, and these fields lose the **first character of each burst**. (An earlier note blamed a 1-second clock tick; the identical positions rule that out.)
- **Impact:** reproducible with rapid/burst input. That covers fast typists, macOS/Windows dictation, text expanders and IMEs that insert runs of characters. Ordinary keystroke-by-keystroke typing wasn't proven to trigger it here. It matches the symptom commit `c1d9b25` targeted, but that commit only changed the Hire `CandidateAssessmentPage` and the conversational auto-submit timer.
- **Suspects to check (fields that drop have heavier work per keystroke than the ones that don't):**
  - [useConversational.js:96-103](../../client/src/hooks/useConversational.js) — `storage.set(...)` + `setConvSavedAt(Date.now())` on every `convAnswer` change.
  - [useOAForm.js:43-67](../../client/src/hooks/useOAForm.js) — `storage.set(...)` + `setInterview(...)` (rebuilds the whole interview tree) on every keystroke.
  - Resume-review JD field: check its `onChange` for similar per-keystroke side effects.
  - Apply the same debounce + flush-on-pagehide used in `c1d9b25`, then rerun the table above as a regression check (a Playwright `page.keyboard.insertText` in ~50-char chunks should reproduce it in CI).
- **Separate data-path risk:** with the mic live, STT results write into the same answer string via `oaAnswersSetterRef`/`convAnswerSetterRef`, and `onTranscriptCorrection` → `replaceLastOccurrence` ([speechTranscription.js:39](../../client/src/utils/speechTranscription.js)) replaces the last match of the browser-heard text *anywhere* in the answer. In OA these update `oaAnswers` (what gets saved) while the textarea shows `OAForm`'s `localDrafts`, so the text on screen and the saved text can diverge.

### B3 — Hands-free microphone auto-starts and can't be turned off (High — privacy)
- **Repro:** Practice OA round → move from problem 2 back to problem 1. Mic becomes "Mic live · listening" with no user click. Clicking the chip does nothing; there is no mute/stop control.
- **Cause:** [OAForm.jsx:74-77](../../client/src/components/OAForm.jsx) calls `onStartHandsFree` whenever an unspoken question becomes active; [VoiceControls.jsx:79-85](../../client/src/components/VoiceControls.jsx) renders the active state as a non-interactive `Chip`. Behavior is inconsistent: didn't auto-start on reload or for problem 2, did for 2→1.
- **Audio is uploaded:** while the user never enabled the mic, the network log shows 6+ `POST /api/stt/transcribe` calls (25–106 KB of audio each) across the OA and system-design rounds. System design does the same by design: [SystemDesignDiscussionPanel.jsx:153-162](../../client/src/components/SystemDesignDiscussionPanel.jsx) retries `startHandsFree` until the mic is live.
- **Fix direction:** only start the mic after an explicit "Enable microphone", and give the live chip a Mute/Stop action (`stopHandsFree` already exists in `useVoiceInput`).

### B4 — Webcam starts unprompted in personal practice (Medium — privacy)
- `OAForm.jsx:219` renders `<WebcamPreview autoStart required />`. In a *personal practice* session the preview switched from "Turn camera on" to a live feed labeled "Required" without a click. Practice shouldn't require a camera; make it opt-in.

### B5 — Typed system-design reply is delayed while the tab is hidden (Low)
- [useSystemDesignDiscussion.js:107-108](../../client/src/hooks/useSystemDesignDiscussion.js) skips checkpoints when `document.hidden`, and [SystemDesignDiscussionPanel.jsx:146-151](../../client/src/components/SystemDesignDiscussionPanel.jsx) clears the forced-send flag anyway. **Re-check result:** the text isn't lost. Once the tab is visible, a periodic checkpoint picks it up within ~10s. The only cost is a delayed reply. Optional fix: fire the pending forced send on `visibilitychange`.
- Note for testers: on macOS, a Chrome window covered by another app reports `document.hidden=true` even when focused. Automated runs need the window uncovered (or a `document.hidden` override) for interviewer replies to appear.

### B6 — Finishing the interview by skipping the last round shows Round 1's debrief (Low)
- After Skip Round on the final round, the page shows "Round 1 of 3 · API Design…" debrief with **"Continue to Distributed Systems and Scalability"**, a round that's already complete. Expected: redirect to `/practice/interviews/:id/feedback` (overall report) or an "Interview complete" state.

### B7 — "Interviewer is preparing this round · 25%" label disagrees with its bar (Low)
- During round 3 preparation the text said 25% while the progress bar was ~85% full.

### B8 — Practice rounds hit the AI rate limit mid-interview (High; found during load testing)
- All `/api/questions/*` routes (OA autosave `/answers`, `/answer`, `/follow-up-answer`, `/complete`, `/system-design/checkpoint`) share `aiLimiter`: 30 requests per 15 min per user ([app.js](../../server/src/app.js), `app.use("/api/questions", aiLimiter, ...)`). The Practice system-design client checkpoints every 7 s while the candidate talks and every 15 s while they're silent ([useSystemDesignDiscussion.js](../../client/src/hooks/useSystemDesignDiscussion.js)), so the budget runs out in ~7–8 min. Then the interviewer goes silent and round completion returns 429. Verified: request 31 → 429. OA autosave failures are only `console.debug`-logged. Details and fix: [../load-testing/local-api-load-report.md](../load-testing/local-api-load-report.md).

## UI/UX improvement suggestions

| ID | Where | Suggestion | Priority |
|----|-------|------------|----------|
| U1 | `/` when signed in | A Hire-only user (owner@) is sent to Practice dashboard. Route by last-used product or org membership, or show a product chooser. | Medium |
| U2 | Unknown routes | `path="*"` → `Navigate to "/"` hides broken links. Add a real 404 page with links to Practice/Hire/Docs. | Medium |
| U3 | `/plans` | `₹699.00` → `₹699` (no paise on whole-rupee prices). Personal (Practice Pro) and org plans (Hire *) share one row; group them under "For engineers" / "For hiring teams". CTAs "View X" are vague — "Start Pro" / "Start pilot". | Low |
| U4 | `/login` | Subtitle "Choose the product you were using…" but there's no chooser on the page. Google button is narrow while the SSO button is full width — make them consistent. Card re-centers vertically when errors appear (layout jump); top-align it. Auth pages & app pages keep the generic `<title>`; set per-page titles ("Sign in · EvalcueAI"). | Low |
| U5 | `/practice/progress` empty | Add a "Start a practice interview" button to the empty state. "No change yet" uses the same big numeric styling as metrics — use muted text. | Low |
| U6 | `/practice/new` step 1 | Primary action "Build my interview plan" is an **outlined** button; make it the contained primary. Consent checkbox sits lower than its label (misaligned). Loading state is a bare spinner inside the button for ~10s — show a progress message ("Drafting rounds…"). | Medium |
| U7 | `/practice/new` step 2 | Banner says "Limited public company-specific evidence was found… based on the JD, role, and resume" when no company and no resume were provided — tailor the message to inputs. "This plan is clearly treated as…" reads awkwardly. Selected round cards use a grey fill that reads as *disabled*. | Medium |
| U8 | Interview overview | Step 1 copy says "choose the round you want to start from the interview overview", but the overview locks rounds in order; heading "Choose your next round" with only one selectable option. Align the copy ("Your interview rounds" / "Up next: …"). Nav highlights "Overview" while inside an interview. | Low |
| U9 | OA workspace | Problem statements are a one-line heading (no constraints, I/O format, examples) yet the workspace offers stdin + Run. Either generate full specs or hide stdin/Run for design-style prompts. | Medium |
| U10 | Conversational round | "The interviewer has the floor" sits next to "Keep speaking naturally" (contradictory). Footer has four similar actions — End round / Skip Round / Move on / Submit now; group them (primary: Submit; overflow menu: Move on, Skip, End). End-round dialog says feedback comes "after the interview is complete", but feedback appears per round. "Saved 2m ago" shown on a brand-new round. | Medium |
| U11 | Feedback views | Round score is a small label in the corner; make it the headline number. Prose answers render in monospace like code. "Top improvements across the interview" just repeats round 1 Q1's suggestions; aggregate across rounds. | Low |
| U12 | Resume tools | Upload stays disabled until the consent box is ticked with no hint why; put the consent next to the button or show helper text. Empty state has no upload CTA. Card actions are unlabeled icons (add tooltips/labels). Resume review doesn't prefill Target role from the profile. Dates like `04/10/2026` are ambiguous; use `4 Oct 2026`. | Low |
| U14 | Hire builder | Recovered drafts load silently. Ask "Resume your draft from 15:02 or start fresh?" instead. "Discard local changes" sits next to Back on every step and wipes the form with no confirmation; add a confirm dialog or move it into an overflow menu. Header says "Recovered locally" even for a brand-new draft. "Product starter" / "Sales starter" presets look out of place in a technical-hiring tool. "Generate with AI" is outlined though it's the main action. | Medium |
| U15 | Hire candidate | "There is no interviewer configuration step" is internal wording; drop it. Start assessment shows a bare spinner for ~8s; show "Preparing your interview…". | Low |
| U13 | System design | At ~1200px wide, Excalidraw's properties panel plus the webcam overlay cover a big part of the canvas; collapse the panel by default and let the camera dock into the chat column. | Low |

## Re-check of points where testing got stuck

| Stuck point | Cause | Re-check result |
|---|---|---|
| System-design interviewer never replied (Practice) | Chrome window covered by another app → `document.hidden=true`; checkpoints skip hidden tabs | ✅ Works end to end when visible (#44). Hidden sends are delayed, not lost (#45) |
| First login attempt "lost" typed credentials | Stale element refs from a pre-render `find` | Not an app bug. Login worked on retry (#12) |
| Candidate identity form came back empty | My click coordinates came from a differently-scrolled screenshot (focus stayed on `BODY`) | Not an app bug. Fields hold values when clicked correctly |
| Coding round Q1 overwritten with the SQL answer | Browser window resized between steps, so a coordinate click missed "problem 2" | Not an app bug (my input error) |
| Reading the candidate link from the clipboard froze the tab | Clipboard-read permission prompt in the automation context | Tool limitation; read `shareToken` from the DB instead |
| Mobile 390px resize didn't apply | Window maximized | Used 390px iframes instead (#7) |
| Dev servers stopped mid-session | 30-min background limit of the test harness | Restarted with a 2h limit |
| Character drops attributed to a 1s timer | Wrong theory | Corrected: deterministic ~53-char burst boundaries (B2) |
