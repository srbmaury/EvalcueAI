# Hiring Workflow and Email Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the reported Hiring workflow regressions and standardize all live transactional email flows.

**Architecture:** Keep recruiter workflow logic in focused helpers/controllers rather than expanding the legacy assessment controller. Centralize email rendering, invitation composition, schedule timezone conversion, integrity start policy, and candidate transcription configuration so immediate/queued/browser flows share the same rules.

**Tech Stack:** React 19, Material UI, Vitest, Playwright, Express, MongoDB/Mongoose, Zod, Brevo, Stripe.

**Spec:** `docs/superpowers/specs/2026-09-12-hiring-workflow-and-email-cleanup-design.md`

## Global Constraints

- Keep Hiring changes separate from merged Practice PR #57.
- Write or update regression tests before production behavior changes.
- Preserve existing candidate/recruiter routes and public assessment URLs.
- Do not create duplicate Stripe prices; live checkout depends on live Stripe/Render configuration.
- Do not merge until full client/server CI and Hiring browser regressions pass.

---

### Task 1: Structured transactional email foundation
**Files:** `server/src/utils/transactionalEmail.js`, `server/src/utils/mailer.js`, associated unit tests.
- [x] Write failing renderer/mailer tests.
- [x] Add shared HTML/plain-text renderer.
- [x] Add safe per-message Reply-To override.
- [x] Migrate verification email.

### Task 2: Structured Hiring invitations
**Files:** `server/src/utils/hiringInvitationEmail.js`, `server/src/services/assessmentLifecycle.js`, `server/src/controllers/hiringAssessmentWorkflowController.js`.
- [x] Write invitation detail/timezone tests.
- [x] Add shared Hiring invitation builder.
- [x] Use it for queued lifecycle sends.
- [x] Use it for immediate recruiter sends.

### Task 3: Draft editing and timezone correctness
**Files:** `client/src/utils/hiringAssessmentPayload.js`, `client/src/pages/AssessmentBuilderPage.jsx`, `server/src/utils/hiringAssessmentUpdatePolicy.js`, `server/src/controllers/hiringAssessmentWorkflowController.js`.
- [x] Write payload/timezone/update-policy tests.
- [x] Add explicit IANA timezone conversion helpers.
- [x] Make backend tolerate legacy content + same-status draft payloads.
- [ ] Wire the builder to the helpers and explicit timezone labels.

### Task 4: Recruiter invitation UX and report time display
**Files:** `client/src/utils/hiringInvites.js`, `client/src/pages/AssessmentReportPage.jsx`.
- [x] Write invite parsing tests.
- [x] Add parsing/outcome helpers.
- [ ] Show warning on empty invite send, focus input, and summarize sent/queued/failed.
- [ ] Render scheduled times in the assessment timezone.

### Task 5: Candidate integrity enforcement
**Files:** `client/src/utils/hiringIntegrityPolicy.js`, `client/src/pages/CandidateAssessmentPage.jsx`, Hiring E2E specs.
- [x] Write integrity policy tests.
- [x] Add policy helper independent of invite mode.
- [ ] Block start until required camera/fullscreen readiness succeeds.
- [ ] Block active interaction on required fullscreen loss until recovery while recording the event.
- [ ] Add browser regression for shareable-link integrity requirements.

### Task 6: Hiring system-design voice
**Files:** `client/src/utils/hiringVoicePolicy.js`, `client/src/pages/CandidateAssessmentPage.jsx`, Hiring E2E specs.
- [x] Write transcription configuration tests.
- [x] Add candidate transcription endpoint/header policy.
- [ ] Wire candidate voice hook to policy.
- [ ] Add system-design candidate speech regression and inspect exact failure before any deeper microphone fix.

### Task 7: Standardize Practice reminders
**Files:** `server/src/utils/practiceReminderEmail.js`, `server/src/services/practiceReminders.js`, unit tests.
- [x] Write structure coverage.
- [x] Migrate weekly reminders to shared transactional structure.

### Task 8: Billing and verification
**Files:** billing UI/config only if evidence requires a code change.
- [x] Verify test Stripe catalog contains active recurring Hiring Starter (25 interviews/month).
- [ ] Verify live Stripe/Render price configuration when a live Stripe account is available.
- [ ] Run full server/client CI, inspect exact failures, fix regressions, and rerun to green.
- [ ] Request review/merge only after verification.
