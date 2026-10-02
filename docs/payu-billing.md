# PayU billing setup

Checkouts use PayU India. Monthly plans use hosted recurring consent followed by a Zion subscription. Hiring Pilot is a single payment.

## Configuration

Populate the PayU fields in `server/.env.example` through your secret manager. Amounts are integer paise (₹1 = 100 paise), and monthly plan IDs must match the approved Zion catalog. Do not turn on production checkout until the prices have been approved, PayU has enabled Zion, and its bearer token is available and monitored for expiry. The callback origin is the public HTTPS API origin, without a path. The shared service catalog supplies the default amounts: Practice Pro ₹699/month, Hire Pilot ₹2,999 once, Starter ₹9,999/month, and Growth ₹29,999/month. Explicit amount environment variables override these defaults. The public `/plans` page and unauthenticated `/api/billing/catalog` endpoint expose pricing without requiring an account; checkout uses the same server catalog.

Configure payment callbacks/webhooks at `/api/billing/payu/return` and `/api/billing/payu/webhook`. Configure Zion events at `/api/billing/payu/zion-webhook`. Payment callbacks require the PayU reverse hash and matching order details; activation also requires server-side payment verification. Zion notifications are only hints: the server fetches the authoritative subscription state. A 15-minute reconciliation job recovers missed notifications. Monthly mandates run for up to five years, with 59 renewal invoices after the first consent payment.

## Required acceptance checks

Use PayU sandbox credentials and an externally reachable HTTPS test callback. Test successful consent, failure, abandoned checkout, delayed callback, callback replay, failed verification, an unready mandate, first renewal, missed renewal, cancellation, and webhook replay. Verify the Zion plan amount, currency, next debit date and customer consent in PayU's dashboard. Confirm that canceling stops future debits while current paid access continues. Unit and isolated integration tests exercise protocol hashing, amount validation, replay safety and activation; they do not prove actual bank mandate acceptance or future collection.

## Recovery

Orders in `creating` or `review_required` must be investigated before another subscription POST. A lost response could mean PayU created the schedule. Look up the subscription in PayU using `customParameter.evalcueOrder` (the stored transaction ID). Check the consent payment ID, plan ID, amount, INR currency, customer and Enabled state. If exactly one correct subscription exists, attach its ID to that order and set provisioning to `ready`, then retry the authenticated payment-status endpoint. If no subscription exists, confirm this with PayU before resetting provisioning to `none`. If multiple schedules exist, cancel duplicate schedules with PayU and resolve any duplicate charges before retrying. Never blindly reset or retry an ambiguous creation.

Expired checkout reservations without any provisioning can be replaced after 30 minutes. A captured payment for an older checkout that conflicts with a newer checkout or active subscription is held for review rather than creating another mandate. Refunds, receipts and payment-method changes currently use billing support; there is no equivalent PayU customer portal in this implementation. Account deletion strips stored checkout contact details while retaining transaction records for reconciliation and legally required accounting.

## Provider references

- https://docs.payu.in/docs/hashing-request-and-response
- https://docs.payu.in/docs/payu-hosted-integration-subscriptions
- https://docs.payu.in/reference/create-a-subscription
- https://docs.payu.in/reference/get-subscription-details-api
- https://docs.payu.in/reference/cancel-subscription-api
