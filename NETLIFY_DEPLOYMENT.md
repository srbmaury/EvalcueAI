# Netlify deployment: Landing, Practice, and Hiring

Deploy the same repository to three Netlify sites. All sites use the root `netlify.toml`, so the base directory, build command, SPA fallback, cache headers, CSP, and security headers are shared.

## 1. Create the common landing site

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

## 2. Create the Practice and candidate site

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

## 3. Create the recruiter Hiring site

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

## 4. Configure the API

Host the Express server at `https://api.evalcueai.com` and configure at least:

```text
NODE_ENV=production
SERVER_ORIGIN=https://api.evalcueai.com
CLIENT_ORIGIN=https://practice.evalcueai.com
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

Keep all remaining production secrets described in `server/.env.example` on Render or the appropriate secret manager. Never place JWT, CAPTCHA secret, Stripe, Brevo, Cloudinary, AI, SSO-encryption, Redis, or other server credentials in Netlify `VITE_*` variables; Vite values are embedded in public browser JavaScript.

The API must allow credentialed CORS from all frontend origins. Because the application origins are HTTPS hosts under `evalcueai.com`, the refresh cookie remains same-site.

When configuring the Brevo delivery webhook, send `BREVO_WEBHOOK_SECRET` in the `X-Evalcue-Webhook-Secret` request header. Do not put webhook credentials in the callback URL query string.

## 5. Add DNS records

After Netlify creates the sites, copy the exact DNS values shown by Netlify. Add the two subdomain records in your DNS provider:

| Type | Name | Value |
| --- | --- | --- |
| CNAME | `practice` | the Practice site's `*.netlify.app` hostname |
| CNAME | `hiring` | the Hiring site's `*.netlify.app` hostname |

For the apex `evalcueai.com`, use the A/ALIAS record Netlify shows in its domain setup screen; apex records cannot use a normal CNAME at many DNS providers. Add the API provider's required record separately for `api`. Do not create competing A/AAAA/CNAME records for the same host. Wait for Netlify to show every custom domain as verified and HTTPS enabled before launch.

## Result

- `https://evalcueai.com/` is the common landing and documentation site.
- `https://practice.evalcueai.com/` owns Practice and candidate assessment sessions.
- `https://hiring.evalcueai.com/` owns recruiter/hiring workflows.
- Candidate links use `https://practice.evalcueai.com/assessment/:token`.
- Opening a route on the wrong product domain transfers it to the correct domain while preserving its path, query, and hash.
