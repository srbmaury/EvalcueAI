# EvalcueAI production runbook

## Deployment topology

Run the React build behind a CDN and the API as a Node 20+ service. Production requires a transaction-capable MongoDB replica set or sharded cluster, Redis, HTTPS, Brevo transactional email, Cloudinary for resume storage, CAPTCHA, Stripe, and at least one AI provider. Judge0 and server STT are required only when their feature flags are enabled.

The API process currently starts BullMQ workers and scheduled reminder/assessment tasks. Run one worker-enabled API replica until workers and schedulers are split into dedicated process types.

## Pre-deployment

1. Run client lint, unit tests, build, Playwright, and dependency audit.
2. Run server unit tests, API journeys, and dependency audit.
3. Confirm `/health/readiness` returns 200 in staging.
4. Send a test email/reminder and complete a Stripe test checkout.
5. Verify Stripe and Brevo webhook delivery/replay behavior.
6. Confirm MongoDB and Cloudinary backup/restore coverage before schema-affecting releases.
7. Verify generated `sitemap.xml` contains the production origin and canonical `/practice` and `/hire` routes.

## Environment and secrets

Use a secret manager. Never commit `.env`.

Configure `ALLOWED_ORIGINS`, `CLIENT_ORIGIN`, and `SERVER_ORIGIN` explicitly on the API. Configure `VITE_PUBLIC_ORIGIN` on the frontend build to the canonical public origin; it drives canonical metadata plus sitemap/robots generation.

Rotate JWT, Brevo, Stripe, AI, Cloudinary, Redis, CAPTCHA, metrics, SSO-encryption, and Sentry credentials after suspected exposure.

## Deployment and shutdown

Deploy immutable artifacts and wait for readiness before routing traffic. On SIGTERM/SIGINT the API stops schedulers and OTLP timers, stops accepting new HTTP traffic, drains in-flight HTTP requests and BullMQ workers, closes queues, then closes MongoDB and Redis. `SHUTDOWN_TIMEOUT_MS` defaults to 15 seconds and forces a non-zero exit if draining stalls.

On release failure, route traffic to the previous artifact. Do not roll back persisted data without a reviewed migration rollback.

## Backups

- Enable continuous MongoDB backups with point-in-time recovery.
- Test restoration quarterly into an isolated account.
- Use Cloudinary provider backups/version retention where required.
- Keep Stripe configuration exported/documented separately; Stripe remains the billing ledger.

## Alerts

Alert on readiness failures, elevated 5xx responses, authentication spikes, rate-limit spikes, queue failures/dead letters, reminders in `failed` state, Stripe/Brevo webhook failures, email delivery failures, Mongo pool pressure, Redis reconnects, and AI error/cost anomalies.

## Candidate-assessment recovery

Submissions atomically move to `evaluating`. BullMQ retries evaluation failures, and startup recovery re-enqueues attempts stranded in `evaluating` after a process interruption. Do not manually mark attempts submitted unless the persisted evaluation evidence has been reviewed.

Candidate invitation links are generated from `CLIENT_ORIGIN`. If a candidate receives an incorrect host, verify that value first.

## Reminder recovery

Reminder deliveries are persisted in MongoDB and retried with exponential backoff. After an outage, inspect `reminderdeliveries` for failed records and `lastError`. Do not delete sent records; the unique user/reminder key prevents duplicate delivery.

## Stripe incidents

Check the webhook signing secret, `billingevents`, customer/subscription IDs, and the currently configured catalog:

- `STRIPE_PRACTICE_PRO_PRICE_ID`
- `STRIPE_HIRING_PILOT_PRICE_ID`
- `STRIPE_HIRING_STARTER_PRICE_ID`
- `STRIPE_HIRING_GROWTH_PRICE_ID`

Replay failed webhook events from Stripe after fixing the cause. Never grant paid-plan access solely from a client redirect.

## Security incident

Restrict traffic, preserve logs, rotate affected credentials, revoke sessions by incrementing user token versions and/or deleting refresh-token records, assess affected records, and follow applicable notification requirements. Record the timeline, scope, remediation, and follow-up actions.
