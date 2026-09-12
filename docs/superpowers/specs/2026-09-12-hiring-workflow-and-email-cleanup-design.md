# Hiring Workflow and Email Cleanup Design

## Goal
Fix the reported Hiring-side workflow regressions without mixing them into the already-merged Practice changes, and standardize transactional email structure across Evalcue AI.

## Scope
- Starter checkout configuration diagnostics and pricing consistency.
- Recruiter assessment preview/report publish controls.
- Candidate invitation UX and structured invitation emails.
- Explicit assessment timezone handling and display.
- Duplicate-draft edit/publish flow.
- Integrity enforcement for shareable and invite-only assessments.
- Recruiter-created system-design microphone/transcription path.
- Reusable transactional email layout for verification, reminders, and hiring invitations.

## Design
### Transactional email structure
Create a shared server-side transactional email renderer that produces both HTML and plain text with the same hierarchy: brand, greeting, purpose, primary CTA, details, next-step/help note, support contact, and footer. Hiring invitation emails use a dedicated builder on top of it so immediate and queued invitations share exactly the same copy and timezone formatting. When an assessment support email is supplied, it becomes Reply-To; otherwise Reply-To remains the Evalcue AI sender.

### Assessment editing and timezone
Client payload construction is moved into focused helpers. Edit payloads whitelist only fields accepted by the server and never resend server-managed fields such as `status`, `_id`, organization or share token. Browser-local `datetime-local` values convert to UTC for transport; stored UTC instants convert back to browser-local clock fields for editing. Recruiter-facing display and email deadlines are formatted in the assessment's stored IANA timezone.

### Invitations
Candidate-email parsing is centralized. Blank invitation input is a validation error rather than a silent no-op. Success messages distinguish sent, queued and failed invitations. The invite-only access rule remains independent of integrity requirements.

### Integrity
Camera/fullscreen requirements are driven only by `assessment.integrity`, never by invite mode. Starting is blocked until all configured requirements are satisfied. Losing required fullscreen during an attempt presents a blocking recovery state while still recording the integrity event; it does not auto-fail the candidate.

### System-design voice
Hiring candidate voice uses the same voice hook as Practice, but the candidate transcription endpoint, attempt-token header and public `capabilities.transcription` flag are made explicit through a small policy helper and covered by regression tests. A system-design test verifies candidate speech can reach the Hiring transcription path after TTS/listening transitions.

### Billing
Do not create duplicate price definitions. The code continues to read the configured Stripe Hiring Starter price. The UI distinguishes a platform configuration problem from normal plan availability. Live checkout still requires the live Stripe price ID and Render billing secrets/environment to be configured.

## Testing
Use TDD for new helpers and regressions. Unit tests cover email structure, timezone conversion/formatting, edit payload whitelisting, invite parsing, integrity policy and transcription configuration. Existing Playwright flows are extended for candidate integrity/system-design voice where browser APIs are relevant. Full client/server CI must be green before merge.
