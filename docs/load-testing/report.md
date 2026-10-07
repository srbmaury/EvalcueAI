# Public website load test report

Tested: 2026-10-01T16:29:19.060463+00:00 to 2026-10-01T16:29:57.954036+00:00 (UTC).

## Result

**Public delivery passed this bounded check; the pricing catalog API failed.** All 63 page/health requests succeeded. All 9 catalog requests returned HTTP 404. This is a functional availability failure, not evidence of capacity exhaustion. No observed 429, 5xx, or timeouts.

## Method

Read-only GET requests from one client machine, using 1, 3, then 5 worker threads for 12 seconds per stage (38.9 seconds total including in-flight completion). Workers pause 750 ms between requests. Maximum 180 requests, 10-second timeout, automatic stop at 4 invalid responses among the last 20. Actual total: 72 requests, average 1.85 requests/second; stage totals 6, 24, 42. Stage samples are small and not equally distributed. TLS verification enabled. Each request uses a fresh connection; latency includes DNS/TLS/network overhead, redirects and response body download.

| Target | Requests | Failures | Median ms | p95 ms |
|---|---:|---:|---:|---:|
| landing | 9 | 0 | 683 | 1401 |
| pricing | 9 | 0 | 682 | 997 |
| terms | 9 | 0 | 692 | 956 |
| practice | 9 | 0 | 1615 | 2753 |
| hire | 9 | 0 | 1694 | 2114 |
| liveness | 9 | 0 | 300 | 403 |
| readiness | 9 | 0 | 288 | 360 |
| catalog | 9 | 9 | 282 | 430 |

Overall median 660 ms, p95 1,854 ms, maximum 2,753 ms. Overall HTTP/content failure rate 12.5%, entirely attributable to the catalog route. With nine samples per target, p95 equals the slowest sample; these are directional measurements.

## Findings and next steps

1. `https://api.evalcueai.com/api/billing/catalog` returned 404 every time. Check backend deployment revision and reverse-proxy routing; confirm that the merged catalog route is deployed. The pricing page can still show shared catalog defaults, masking this missing API.
2. Practice and Hire HTML delivery measured higher median latency (1,615 ms and 1,694 ms). Inspect redirects, regional CDN delivery and cache headers before attributing this to server capacity.
3. Health checks were consistently successful (median about 300 ms). This only establishes health-route responsiveness during this small run.

## Limits

This is a bounded live load smoke test, not a maximum-capacity or sustained-soak test. It does not simulate browser rendering, download JavaScript/assets, measure Core Web Vitals, authenticate demo users, exercise interviews/resumes, invoke AI providers or code runners, or test PayU mandates. It has no server CPU, memory, queue, database or distributed tracing telemetry. No claim about supported simultaneous interviews or production capacity can be made. Use an isolated staging environment with provider stubs and server telemetry for sustained authenticated workflow tests.

## Reproduction and raw data

Run `python3 scripts/load_public_site.py` only with authorization for the listed live targets. It overwrites the accompanying result files. See `public-load-results.json` and `public-load-requests.csv` for measurements.
