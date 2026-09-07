# Evalcue AI


Evalcue AI is a full-stack platform for **software engineering interview practice** and **structured technical hiring**. Candidates can rehearse conversational, coding, and system-design interviews with adaptive AI follow-ups. Hiring teams can create role-specific assessments, invite candidates, collect technical evidence, and review scorecards while keeping employment decisions human-controlled.

## Product surfaces

### Evalcue AI Practice

- Role- and job-description-specific interview plans
- Conversational interviews with hands-free voice support
- Coding / online-assessment rounds with code execution when Judge0 is enabled
- Live system-design discussions with an Excalidraw architecture canvas
- Adaptive questioning based on answer evidence, competency coverage, and resume context
- Resume upload, review, JD matching, saved interview experiences, progress tracking, and reminders
- Post-interview feedback and improvement suggestions

Canonical public route: `/practice`

### Evalcue AI Hire

- Organization-owned technical assessments and candidate pipelines
- Manual or AI-generated round definitions
- Conversational, coding, and live system-design assessment modes
- Invite-only candidate links, invitation lifecycle tracking, and local answer recovery
- Weighted competency scorecards, AI evaluation, human overrides, and calibration views
- Optional consented integrity signals such as fullscreen/focus/clipboard/connectivity events and on-device face-presence checks
- OIDC SSO support for eligible hiring organizations

Canonical public route: `/hire`

## Architecture

```text
React 19 / Vite / MUI
        |
        v
Express 5 API
  |       |        |          |
MongoDB  Redis    AI APIs    External services
         BullMQ   OpenAI /   Stripe, Brevo,
                  Gemini     Cloudinary, Judge0
```

- **Client:** React, React Router, Material UI, Axios, Excalidraw, Monaco
- **API:** Express, Zod, Mongoose, JWT-based auth, organization authorization
- **Data:** MongoDB; production transaction support is required
- **Async work:** Redis + BullMQ for question preparation, bulk feedback, and candidate evaluation
- **AI:** OpenAI and/or Gemini, with optional Tavily grounding
- **Operations:** Prometheus metrics, optional Grafana OTLP push, Sentry, structured logs

## Repository layout

```text
client/                  React/Vite SPA
  src/components/        shared UI, interview workspaces, SEO helpers
  src/pages/             public, practice, hiring, and admin pages
  e2e/                   Playwright browser journeys
server/                  Express API
  src/controllers/       request/domain controllers
  src/models/            Mongoose models
  src/queues/            BullMQ queues and workers
  src/routes/            API routing and authorization composition
  src/services/          business logic and integrations
  src/test/              unit and API journey coverage
observability/           dashboards, PromQL, and alert guidance
```

## Getting started

### Prerequisites

For local development: Node.js 20+, MongoDB, and credentials for whichever integrations you want to exercise. AI features require OpenAI or Gemini. Resume storage requires Cloudinary.

Production additionally requires Redis, HTTPS, Brevo transactional email, CAPTCHA, Stripe, MongoDB transactions, and any dependencies for enabled STT/code-execution features.

### Install

```bash
cd server && npm install
cd ../client && npm install
```

### Configure the server

The checked-in example now contains **development-safe defaults** rather than production settings:

```bash
cp server/.env.example server/.env
```

At minimum, set a real `JWT_SECRET` and a reachable `MONGO_URI`. Configure `OPENAI_API_KEY` or `GEMINI_API_KEY` to use AI features. `CLIENT_ORIGIN` is the browser origin and is also the canonical base used in candidate invitation emails.

For production set `NODE_ENV=production` and configure, at minimum:

- `ALLOWED_ORIGINS`, `CLIENT_ORIGIN`, `SERVER_ORIGIN`
- `REDIS_URL`
- `METRICS_TOKEN`
- Brevo API/sender/webhook values
- CAPTCHA secret plus login/register gates
- Cloudinary credentials for resume storage
- at least one AI provider; OpenAI is required when server STT is enabled
- Judge0 and an allowed host when code execution is enabled
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the Practice Pro + Hiring Pilot/Starter/Growth price IDs
- a transaction-capable MongoDB replica set or sharded cluster

### Configure the client

```bash
cp client/.env.example client/.env
```

Important values:

- `VITE_API_BASE_URL=/api` for same-origin/proxied API calls
- `VITE_PUBLIC_ORIGIN=https://your-public-origin.example` in production for canonical URLs, JSON-LD, `sitemap.xml`, and `robots.txt`
- `VITE_APP_SURFACE=landing`, `practice`, or `hiring` when deploying the shared client as separate sites
- `VITE_LANDING_ORIGIN`, `VITE_PRACTICE_ORIGIN`, and `VITE_HIRING_ORIGIN` for safe cross-site navigation and candidate links
- CAPTCHA and Google client IDs when those integrations are enabled

See [NETLIFY_DEPLOYMENT.md](NETLIFY_DEPLOYMENT.md) for the two-site Netlify and GoDaddy DNS setup.

### Run locally

```bash
# terminal 1
cd server
npm run dev

# terminal 2
cd client
npm run dev
```

Default URLs: client `http://localhost:5173`, API `http://localhost:5000`.

## Tests and CI

Client:

```bash
cd client
npm run lint
npm test -- --run
npm run build
npx playwright install chromium
npm run test:e2e
```

Server:

```bash
cd server
npm run test:unit
npm run test:e2e
npm run audit
```

`npm run test:launch` runs the launch-critical API journeys. GitHub Actions runs client lint/unit/build/Playwright/audit plus server unit/API/audit checks on pushes and pull requests. Failed Playwright runs retain browser diagnostics as CI artifacts.

See [TESTING.md](TESTING.md) for the compact command reference.

## Canonical frontend routes

Public/indexable:

- `/` — product overview
- `/practice` — candidate interview-practice product
- `/hire` — technical-hiring product
- `/docs` and `/docs/*` — public documentation
- `/privacy`
- `/terms`

Candidate assessment links:

- `/assessment/:shareToken`

Authenticated Practice:

- `/practice/dashboard`
- `/practice/new`
- `/practice/interviews/:interviewId`
- `/practice/company-insights`
- `/practice/resumes`
- `/practice/resume-review`
- `/practice/resume-reviews`
- `/practice/resume-match`
- `/practice/progress`
- `/practice/profile`

Authenticated Hire:

- `/hire/assessments`
- `/hire/assessments/:assessmentId`
- `/hire/assessments/:assessmentId/preview`
- `/hire/team`
- `/hire/pilot`
- `/hire/sso`

Older routes such as `/assessments`, `/create-interview`, `/dashboard`, `/interview-practice`, and `/technical-hiring` are compatibility redirects and should not be used as canonical links.

## API and documentation

Development/test API documentation:

- `GET /api-docs`
- `GET /api-docs.json`

Swagger UI/JSON are intentionally disabled in production.

Major API areas:

- `/api/auth/*` — registration, login, refresh, profile, verification, password recovery, reminders, deletion
- `/api/resumes/*` — resume CRUD, preview, AI review, history, JD matching
- `/api/interviews/*`, `/api/rounds/*`, `/api/questions/*`, `/api/feedback/*` — Practice interview lifecycle
- `/api/assessments/*` — hiring assessment creation, candidate pipeline, reporting, invitations, scorecards
- `/api/assessments/public/:shareToken/*` — candidate assessment experience guarded by hashed attempt credentials
- `/api/billing/*` — Practice/Hiring entitlements, checkout, portal, signed Stripe webhook
- `/api/organizations/*`, `/api/sso/*` — hiring organization and SSO workflows
- `/api/stt/*`, `/api/run-code` — optional transcription and code execution
- `/health/liveness`, `/health/readiness`, `/metrics` — operations endpoints

## Live system-design interviews

System-design rounds use a single architecture problem with an Excalidraw canvas and a live discussion. During the interview Evalcue AI can issue **bounded, context-aware interviewer interjections** rather than only one fixed follow-up. The interviewer can probe requirements, capacity, consistency, reliability, security, observability, or clarification questions without revealing a solution or coaching the candidate.

The system stores the final candidate transcript as the authoritative answer, the diagram/derived topology summary, and bounded discussion turns. Evaluation uses the complete final candidate transcript plus interviewer prompts and diagram context, so truncating old UI discussion turns does not discard early candidate reasoning.

For hiring assessments, candidate-facing screens do not reveal private scores or recruiter feedback. AI output is advisory evidence; employment decisions remain with human reviewers.

## Reliability and background processing

When Redis is configured, BullMQ runs question preparation, bulk-feedback, and candidate-assessment workers. Candidate submissions atomically enter an `evaluating` state, retry failures, and recover stranded evaluation jobs on startup.

The API also schedules reminder delivery, assessment opening/closing and invitation delivery, integrity-event retention, and Cloudinary cleanup. On SIGTERM/SIGINT the process stops schedulers, drains HTTP requests and BullMQ workers, closes queues, then closes MongoDB and Redis. `SHUTDOWN_TIMEOUT_MS` provides a bounded forced-exit fallback.

See [RUNBOOK.md](RUNBOOK.md) for production operations and recovery.

## Security highlights

- Short-lived access tokens with HttpOnly refresh-session cookies
- Password/session revocation via token versioning and refresh-token records
- CORS allowlists plus state-changing Origin/Referer checks
- Redis-backed rate limits and quotas in production
- CAPTCHA protection for production authentication flows
- File magic-byte/size validation and optional antivirus scanning
- Opt-in Judge0 execution with host allowlisting
- Hashed candidate attempt credentials and non-indexable assessment URLs
- Signed/idempotent Stripe webhooks
- Organization-scoped hiring authorization
- Explicit consent for optional integrity signals
- Human review requirements for AI-assisted hiring evidence

See [SECURITY.md](SECURITY.md) for reporting and policy notes.

## SEO

Public product and documentation pages receive route-specific titles, descriptions, canonical URLs, Open Graph/Twitter metadata, and schema.org JSON-LD. `SearchIndexPolicy` marks authenticated/candidate application routes `noindex,nofollow`. Production builds generate `sitemap.xml` and `robots.txt` from `VITE_PUBLIC_ORIGIN`; only canonical public routes are placed in the sitemap.

## Production checklist

- Use TLS for MongoDB/Redis and HTTPS for the application
- Set explicit browser/API origins and CSP allowlists
- Use a secret manager; never commit `.env`
- Configure backups and test restoration
- Validate Stripe webhook replay and Brevo delivery/bounce handling
- Alert on readiness, 5xx rates, auth/rate-limit spikes, queue failures, failed reminders, webhook failures, and AI cost/error anomalies
- Calibrate AI-generated hiring scores against independent human reviewers before production hiring use

## License

ISC. See [LICENSE](LICENSE).
