# React + Vite

This client is the Evalcue AI React/Vite application.

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

`VITE_PUBLIC_ORIGIN` should be the public canonical origin with no path component. When it is set for a production build, Vite emits `sitemap.xml` and `robots.txt` for the public landing, documentation, privacy, and terms routes. Protected Practice/Hiring routes are intentionally excluded from the sitemap and disallowed in `robots.txt`.

On the server, set `CAPTCHA_ENABLED=true` and `CAPTCHA_SECRET` and enable the login/register CAPTCHA gates in production.

## Headless end-to-end tests

Run the deterministic UI journey suite against the local Vite application:

```bash
npm run test:e2e
```

Run the read-only production smoke suite with seeded demo accounts:

```bash
export E2E_SHARED_PASSWORD='<secret>'
export E2E_CANDIDATE_EMAIL='<candidate account>'
export E2E_HIRING_OWNER_EMAIL='<owner account>'
export E2E_HIRING_REVIEWER_EMAIL='<reviewer account>'
export E2E_ADMIN_EMAIL='<admin account>'
npm run test:e2e:production
```

The production suite runs serially to prevent the shared demo sessions from invalidating each other. It verifies the public domains, legal and SEO pages, API liveness/readiness, candidate session restoration, core Practice pages, owner Hiring access, reviewer restrictions, and platform-admin screens. Store credentials in local or CI secrets; never commit them.
