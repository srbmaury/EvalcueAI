# Validation report — October 1, 2026

All changes remain local. Nothing was pushed or deployed.

| Check | Result |
| --- | --- |
| Client unit/component suite | 283 passed across 87 files |
| Server unit suite, including PayU hash/verification tests | 327 passed across 96 files |
| Server API E2E suite, including PayU mandate/replay/locking tests | 28 passed across 9 files |
| Desktop and mobile Chromium product E2E | 147 passed |
| Real local API demo-account sweep | All 24 manifest accounts passed |
| Production client build | Passed; existing large-chunk warning remains |
| Client lint | No errors; 8 existing warnings |
| Diff whitespace check and changed server syntax | Passed |

The browser suite covers candidate interview progression, media requirements, assessment creation, candidate pipeline/reports, role permissions, session restoration, error/retry paths, public/auth/legal pages, responsive overflow and route scroll reset. The manifest sweep uses an ephemeral local database because the configured database contains none of the 24 manifest accounts. It verifies sign-in, reload persistence, authorized core pages and overflow through the real local API. No configured app data was modified, and no email or real payment was sent.

Visual review covered the public homepage, Practice and Hire homepages, linked resources, legal/documentation layouts, both registration forms, the authenticated Practice dashboard and Hire workspace/team settings. The shared theme uses smaller corners and no button shadows. Public layouts use clearer hierarchy and fewer decorative cards; the Practice dashboard omits repetitive recommendations when no target role is set. Registration terms links preserve the form by opening separately. Scroll resets on route changes while hash links still reach their sections.

## Remaining inputs and provider acceptance

The legal operator is set to SAURABH MAURYA. The registered address and final plan prices still need user confirmation; neither was invented. PayU merchant credentials, approved INR amounts, matching Zion plan IDs, Zion enablement and an HTTPS callback are needed for provider sandbox acceptance. Hashing, payment matching, mandate readiness, replay safety, cancellation and ambiguous-POST recovery pass isolated tests, but actual bank mandates and automatic collection have not been tested. Existing Stripe subscriptions retain their portal/webhook during migration and require explicit new PayU consent to move providers.

See `payu-billing.md` for configuration and recovery, and `local-qa.md` to repeat demo-account tests.
