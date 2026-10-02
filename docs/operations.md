# EvalcueAI operations

Deployment, configuration, testing and incident procedures. See the [README](../README.md) for the product and architecture overview, [payu-billing.md](payu-billing.md) for billing, [runner/README.md](../runner/README.md) for the code runner and [observability/README.md](../observability/README.md) for monitoring.

## Deployment: Landing, Practice and Hiring sites

Deploy the same repository to three Netlify sites. All sites use the root `netlify.toml`, so the base directory, build command, SPA fallback, cache headers, CSP, and security headers are shared.

### 1. Create the common landing site

Import this GitHub repository in Netlify and set:

```text
VITE_APP_SURFACE=landing
VITE_PUBLIC_ORIGIN=https://evalcueai.com
VITE_LANDING_ORIGIN=https://evalcueai.com
VITE_PRACTICE_ORIGIN=https://practice.evalcueai.com
VITE_HIRING_ORIGIN=https://hiring.evalcueai.com
VITE_API_BASE_URL=https://api.evalcueai.com/api
```

Add `evalcueai.com` as its primary custom domain. Optionally redirect `www.evalcueai.com` to the apex domain.

### 2. Create the Practice and candidate site

Import this GitHub repository in Netlify and set:

```text
VITE_APP_SURFACE=practice
VITE_PUBLIC_ORIGIN=https://practice.evalcueai.com
VITE_LANDING_ORIGIN=https://evalcueai.com
VITE_PRACTICE_ORIGIN=https://practice.evalcueai.com
VITE_HIRING_ORIGIN=https://hiring.evalcueai.com
VITE_API_BASE_URL=https://api.evalcueai.com/api
```

Add the custom domain `practice.evalcueai.com` in Netlify. Invited candidates complete hiring assessments on this site.

### 3. Create the recruiter Hiring site

Import the same repository as a third Netlify site and set:

```text
VITE_APP_SURFACE=hiring
VITE_PUBLIC_ORIGIN=https://hiring.evalcueai.com
VITE_LANDING_ORIGIN=https://evalcueai.com
VITE_PRACTICE_ORIGIN=https://practice.evalcueai.com
VITE_HIRING_ORIGIN=https://hiring.evalcueai.com
VITE_API_BASE_URL=https://api.evalcueai.com/api
```

Add the custom domain `hiring.evalcueai.com`. This site is for recruiters, hiring organizations, assessment authoring, and reports.

Google's client ID does **not** need to be duplicated across these Netlify sites; the browser loads it from `GET /api/auth/public-config`, and the Render API is the production source of truth. The CAPTCHA **site key** is different: it is a public but client build-time value, not served by the API, so set `VITE_TURNSTILE_SITE_KEY` (or `VITE_RECAPTCHA_SITE_KEY` plus `VITE_CAPTCHA_PROVIDER=recaptcha`, if using reCAPTCHA) on every Netlify site that renders a login/register form or the candidate assessment flow — Practice and Hiring. Rotating this key only needs a rebuild of those sites, not a server change.

### 4. Configure the API

Host the Express server at `https://api.evalcueai.com` and configure at least:

```text
NODE_ENV=production
SERVER_ORIGIN=https://api.evalcueai.com
PRACTICE_CLIENT_ORIGIN=https://practice.evalcueai.com
HIRING_CLIENT_ORIGIN=https://hiring.evalcueai.com
ALLOWED_ORIGINS=https://evalcueai.com,https://www.evalcueai.com,https://practice.evalcueai.com,https://hiring.evalcueai.com,https://api.evalcueai.com
COOKIE_DOMAIN=.evalcueai.com
COOKIE_SAMESITE=lax

# Browser-safe auth configuration served by /api/auth/public-config
GOOGLE_CLIENT_ID=<Google web client id>
CAPTCHA_ENABLED=true
CAPTCHA_PROVIDER=turnstile
CAPTCHA_SECRET=<Turnstile secret key>
CAPTCHA_LOGIN_ENABLED=true
CAPTCHA_REGISTER_ENABLED=true
```

Keep all remaining production secrets described in `server/.env.example` on Render or the appropriate secret manager. Never place JWT, CAPTCHA secret, PayU, Brevo, Cloudinary, AI, SSO-encryption, Redis, or other server credentials in Netlify `VITE_*` variables; Vite values are embedded in public browser JavaScript.

The API must allow credentialed CORS from all frontend origins. Because the application origins are HTTPS hosts under `evalcueai.com`, the refresh cookie remains same-site.

When configuring the Brevo delivery webhook, send `BREVO_WEBHOOK_SECRET` in the `X-Evalcue-Webhook-Secret` request header. Do not put webhook credentials in the callback URL query string.

### 5. Add DNS records

After Netlify creates the sites, copy the exact DNS values shown by Netlify. Add the two subdomain records in your DNS provider:

| Type | Name | Value |
| --- | --- | --- |
| CNAME | `practice` | the Practice site's `*.netlify.app` hostname |
| CNAME | `hiring` | the Hiring site's `*.netlify.app` hostname |

For the apex `evalcueai.com`, use the A/ALIAS record Netlify shows in its domain setup screen; apex records cannot use a normal CNAME at many DNS providers. Add the API provider's required record separately for `api`. Do not create competing A/AAAA/CNAME records for the same host. Wait for Netlify to show every custom domain as verified and HTTPS enabled before launch.

### Result

- `https://evalcueai.com/` is the common landing and documentation site.
- `https://practice.evalcueai.com/` owns Practice and candidate assessment sessions.
- `https://hiring.evalcueai.com/` owns recruiter/hiring workflows.
- Candidate links use `https://practice.evalcueai.com/assessment/:token`.
- Opening a route on the wrong product domain transfers it to the correct domain while preserving its path, query, and hash.

## Client configuration

Create a `.env` file in `client/` with the values your environment needs:

```env
VITE_API_BASE_URL=/api
# Canonical production origin used to generate sitemap.xml and robots.txt.
# Example: https://www.evalcue.example
VITE_PUBLIC_ORIGIN=

VITE_CAPTCHA_PROVIDER=turnstile
VITE_TURNSTILE_SITE_KEY=<your_turnstile_site_key>
# If using reCAPTCHA instead:
# VITE_CAPTCHA_PROVIDER=recaptcha
# VITE_RECAPTCHA_SITE_KEY=<your_recaptcha_site_key>

VITE_GOOGLE_CLIENT_ID=<your_google_oauth_client_id>
VITE_ACCOUNT_DATA_EXPORT_ENABLED=false

# Google Analytics (gtag.js). Leave unset to disable it entirely.
VITE_GA_MEASUREMENT_ID=<your_ga_measurement_id>
# Sends real hits from localhost too; leave false so dev/test traffic doesn't
# pollute production GA data.
VITE_GA_LOCAL_ENABLED=false
```

`VITE_PUBLIC_ORIGIN` is an optional canonical-origin override and should be an origin with no path component. In the standard three-site deployment, Vite uses `https://evalcueai.com`, `https://practice.evalcueai.com`, or `https://hiring.evalcueai.com` based on `VITE_APP_SURFACE`, then emits that surface's `sitemap.xml` and `robots.txt` without needing this override. The landing robots file references all three sitemaps. Protected Practice/Hiring routes are excluded from their sitemaps; only the public product home and resources are included.

On the server, set `CAPTCHA_ENABLED=true` and `CAPTCHA_SECRET` and enable the login/register CAPTCHA gates in production.

## Production runbook

### Deployment topology

Run the React build behind a CDN and the API as a Node 22 service. Production requires a transaction-capable MongoDB replica set or sharded cluster, Redis, HTTPS, Brevo transactional email, Cloudinary for resume storage, CAPTCHA, PayU, and at least one AI provider. The code runner (`runner/`) and server STT are required only when their feature flags are enabled; see [runner/README.md](../runner/README.md) for the runner.

The API process currently starts BullMQ workers and scheduled reminder/assessment tasks. Run one worker-enabled API replica until workers and schedulers are split into dedicated process types.

### Pre-deployment

1. Run client lint, unit tests, build, Playwright, and dependency audit.
2. Run server unit tests, API journeys, and dependency audit.
3. Confirm `/health/readiness` returns 200 in staging.
4. Send a test email/reminder and complete a PayU sandbox checkout.
5. Verify PayU callback/Zion and Brevo webhook delivery/replay behavior.
6. Confirm MongoDB and Cloudinary backup/restore coverage before schema-affecting releases.
7. Verify generated `sitemap.xml` contains the production origin and canonical `/practice` and `/hire` routes.

### Environment and secrets

Use a secret manager. Never commit `.env`.

Configure `ALLOWED_ORIGINS`, `PRACTICE_CLIENT_ORIGIN`, `HIRING_CLIENT_ORIGIN`, and `SERVER_ORIGIN` explicitly on the API. Configure `VITE_PUBLIC_ORIGIN` on the frontend build to the canonical public origin; it drives canonical metadata plus sitemap/robots generation.

Rotate JWT, Brevo, PayU, AI, Cloudinary, Redis, CAPTCHA, metrics, SSO-encryption, and Sentry credentials after suspected exposure.

### Deployment and shutdown

Deploy immutable artifacts and wait for readiness before routing traffic. On SIGTERM/SIGINT the API stops schedulers and OTLP timers, stops accepting new HTTP traffic, drains in-flight HTTP requests and BullMQ workers, closes queues, then closes MongoDB and Redis. `SHUTDOWN_TIMEOUT_MS` defaults to 15 seconds and forces a non-zero exit if draining stalls.

On release failure, route traffic to the previous artifact. Do not roll back persisted data without a reviewed migration rollback.

### Backups

- Enable continuous MongoDB backups with point-in-time recovery.
- Test restoration quarterly into an isolated account.
- Use Cloudinary provider backups/version retention where required.
- PayU remains the payment ledger; `paymentorders` records reference its transaction and subscription IDs.

### Alerts

Alert on readiness failures, elevated 5xx responses, authentication spikes, rate-limit spikes, queue failures/dead letters, reminders in `failed` state, PayU/Brevo webhook failures, email delivery failures, Mongo pool pressure, Redis reconnects, and AI error/cost anomalies.

### Candidate-assessment recovery

Submissions atomically move to `evaluating`. BullMQ retries evaluation failures, and startup recovery re-enqueues attempts stranded in `evaluating` after a process interruption. Do not manually mark attempts submitted unless the persisted evaluation evidence has been reviewed.

Candidate invitation links are generated from `PRACTICE_CLIENT_ORIGIN`. If a candidate receives an incorrect host, verify that value first.

### Reminder recovery

Reminder deliveries are persisted in MongoDB and retried with exponential backoff. After an outage, inspect `reminderdeliveries` for failed records and `lastError`. Do not delete sent records; the unique user/reminder key prevents duplicate delivery.

### Payment incidents

Check `PAYU_MERCHANT_KEY`, `PAYU_MERCHANT_SALT`, `PAYU_ZION_TOKEN` (and its expiry), `PAYU_CALLBACK_ORIGIN`, the affected `paymentorders` record, and the configured `PAYU_*_AMOUNT_PAISE` / `PAYU_*_PLAN_ID` catalog. Follow the recovery steps in [docs/payu-billing.md](payu-billing.md). Never grant paid-plan access solely from a client redirect.

### Security incident

Restrict traffic, preserve logs, rotate affected credentials, revoke sessions by incrementing user token versions and/or deleting refresh-token records, assess affected records, and follow applicable notification requirements. Record the timeline, scope, remediation, and follow-up actions.

## Testing

Run commands from the repository root unless a section says otherwise.

### Client

```bash
cd client

# Unit tests
npm test
npm run test:watch
npm test -- src/__tests__/assessmentsPage.test.jsx

# Quality checks
npm run lint
npm run build
```

`npm test`/`test:watch`/`test:coverage` set `NODE_OPTIONS=--no-experimental-webstorage`.
Node 22+'s experimental built-in `localStorage` global shadows jsdom's own
implementation and leaves `window.localStorage` undefined otherwise. If you
invoke `vitest` directly instead of through these npm scripts, set that flag
yourself.

```bash
cd client

# All browser E2E tests
npm run test:e2e

# Desktop or mobile browser only
npx playwright test --project=desktop-chromium
npx playwright test --project=mobile-chromium

# Visible browser, slowed down for observation
npx playwright test --project=desktop-chromium --headed --workers=1
PWDEBUG=console npx playwright test --project=desktop-chromium --headed --workers=1

# Playwright Inspector and step-by-step debugging
npx playwright test --project=desktop-chromium --debug

# One file or test name
npx playwright test e2e/productJourneys.spec.js
npx playwright test e2e/productJourneys.spec.js --grep "candidate completes an assessment without seeing private feedback" --project=desktop-chromium --debug

# Open the last HTML report or trace
npx playwright show-report
npx playwright show-trace test-results/path-to-trace.zip
```

### Server

Server integration tests start an in-memory MongoDB instance.

```bash
cd server

# All, unit, integration, launch-critical, or watch mode
npm test
npm run test:unit
npm run test:e2e
npm run test:launch
npm run test:watch

# One test file or matching test name
npm test -- src/test/e2e/happyFlows.test.js
npx vitest run src/test/e2e/happyFlows.test.js -t "registers, logs in"

# Dependency security checks
npm run audit
npm run lint:deps
```

### Full local verification

```bash
(cd client && npm run lint && npm test && npm run build && npm run test:e2e)
(cd server && npm test && npm run audit)
```

### Production smoke suite

From `client`, run the read-only production smoke suite with seeded demo accounts:

```bash
export E2E_SHARED_PASSWORD='<secret>'
export E2E_CANDIDATE_EMAIL='<candidate account>'
export E2E_HIRING_OWNER_EMAIL='<owner account>'
export E2E_HIRING_REVIEWER_EMAIL='<reviewer account>'
export E2E_ADMIN_EMAIL='<admin account>'
npm run test:e2e:production
```

The production suite runs serially to prevent the shared demo sessions from invalidating each other. It verifies the public domains, legal and SEO pages, API liveness/readiness, candidate session restoration, core Practice pages, owner Hiring access, reviewer restrictions, and platform-admin screens. Store credentials in local or CI secrets; never commit them.

### Local demo-account validation

The desktop/mobile browser suite uses deterministic API fixtures. The server E2E suite uses isolated MongoDB replica sets and tests actual API behavior. PayU tests mock provider responses; they do not perform real payments or bank mandates.

To validate the supplied demo accounts against the real API without changing existing data:

1. From `server`, run `node src/scripts/startDemoTestServer.mjs`. This creates an ephemeral database, seeds the manifest's accounts and organization memberships, and listens on `127.0.0.1:5501`. The manifest password is read internally and is never printed. External AI, payment, email, storage and telemetry credentials are removed from this process. Stop the process to discard the database.
2. From `client`, run `VITE_API_PROXY_TARGET=http://127.0.0.1:5501 npm run dev -- --host 127.0.0.1 --port 5175 --strictPort`.
3. From `client`, run `npm run test:e2e -- --config=playwright.local-demo.config.js`.

Each demo user is tested with a separate simulated client IP, as independent users would have in practice. This prevents the ten-login-per-IP throttle from combining all 24 accounts into one client. The app's rate limiter remains enabled. The sweep checks sign-in, session restoration, authorized core pages and horizontal overflow. Interview media, assessment progression, recovery and permission edge cases are covered separately by the main browser suite.

Do not point this harness at a production database. Do not commit reports or screenshots containing credentials. The demo QA report directory is ignored by Git.
