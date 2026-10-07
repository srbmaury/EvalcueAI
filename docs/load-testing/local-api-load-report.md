# Local API load test — 2026-10-04

## Re-run after fixes (same day)

Same environment, request mix, stages and stop rules as the first run below; raw data in `local-api-2026-10-04-rerun/`.

**Result: the rate-limit fix works, capacity is unchanged, and one smaller limit remains.**

### Rate limits (real limits, normal config)

| Check | Before fix | After fix |
|---|---|---|
| General API, 310 GETs as one user | 429 from request 301 | 429 from request 301 ✅ |
| Login, 12 failed attempts | 429 from attempt 11 | 429 from attempt 11 ✅ |
| OA autosave `/answers`, 60 POSTs | **429 from request 31** | **no 429** ✅ |
| Interview turns `/answer`, 155 POSTs | **429 from request 31** | 429 from request **151** ✅ (`AI_TURN_RATE_LIMIT_MAX`) |
| Generation `/clarify`, 35 POSTs | 429 from request 31 | 429 from request 31 ✅ (unchanged on purpose) |
| Turns after the generation limit is spent, same user | blocked | not blocked ✅ (separate budgets) |

**Remaining risk: the per-round checkpoint quota.** `/system-design/checkpoint` also has its own quota of **240 per round per hour** (`questionRoutes.js`; verified: 429 from call 241). The client checks every ~7 s while the candidate talks and every 15 s while they're silent. That's ~8.6/min of continuous talk, so a single design round that runs past **~28 minutes of steady discussion** gets 429s and the interviewer stops replying. Round completion still works, because it's a separate route. The 15-minute turn budget sits at ~85% of its limit during continuous talk (~129 of 150). If design rounds can run longer than ~25 minutes, raise the hourly quota to ~600, or make the client back off its checkpoint cadence.

### Capacity — before vs after (req/s · p50 · p95 · p99 ms · errors)

| Users | First run | Re-run |
|---:|---|---|
| 5 | 33.4 · 106 · 391 · 477 · 0% | 31.2 · 121 · 361 · 481 · 0% |
| 25 | 35.3 · 857 · 1,896 · 2,159 · 0% | 37.2 · 845 · 1,880 · 2,028 · 0% |
| 50 | 39.6 · 1,001 · 2,960 · 3,847 · 0% | 39.0 · 1,001 · 2,958 · 3,933 · 0% |
| 100 | 43.4 · 1,966 · 5,003 · 5,898 · 0% | 45.2 · 1,975 · 4,993 · 5,955 · 0% |
| 200 | not reached (stopped at 100) | 46.6 · 3,278 · 9,003 · 9,996 · 0% |

- The plateau is still **~40–47 req/s**, the same Atlas-tier ceiling. The fixes touched limits and client code, not read paths. This run went one stage further because the 100-user p95 came in 7 ms under the 5 s stop line. At 200 users: still 0 errors; Hire p50 ~8 s, Practice p50 ~3 s.
- **Mongo pool at 100 users:** 100/100 checked out, wait queue 6–53. **Event-loop lag:** ≤ 12 ms. **Raw Atlas ceiling:** 101–135 ops/s.
- **DB-free ceiling (`ab`):** liveness 26.9k / 28.5k req/s and catalog 19.4k / 19.5k req/s at concurrency 50 / 200, 0 non-2xx.
- **Soak (20 users, ~1 s think time, 5 min):** 5,223 requests, **0 errors**, p50 116 ms, p95 312 ms, p99 361 ms. RSS fell from 515 MB (left over from the `ab` burst) to ~306 MB within a minute, then stayed flat.

Recommendations 2–4 below still apply; recommendation 1 is done.

---

## First run

## Summary

1. **Bug (fixed 2026-10-04, see `server/src/middleware/questionRouteLimits.js`): Practice rounds could lock themselves out after ~7–8 minutes.** All `/api/questions/*` routes share the AI limiter: **30 requests per 15 min per user**. That covers OA autosave, answer submit, round `/complete`, and the Practice system-design checkpoint. The Practice client checkpoints every 7 s while the candidate talks and every 15 s while they're silent. So a single system-design round spends the whole budget in roughly 7–8 minutes. After that, the interviewer goes quiet and "End discussion"/round completion return **429** until the window resets. Verified: request 31 → 429. Hire candidates are unaffected; they use per-attempt quotas on `/api/assessments/public/...`.
2. **The API server is not the bottleneck; the database is.** DB-free routes went through the full middleware stack at **18–27k req/s** with p99 ≤ 15 ms. DB-backed routes plateaued at **~35–43 req/s from just 5–25 concurrent users**, while server CPU stayed at 10–20% and event-loop lag at ≤ 23 ms.
3. **The ceiling is the Atlas dev cluster.** Raw driver reads, bypassing the app, top out at **~100–140 ops/s** at any concurrency, with a 51 ms round trip. App throughput ≈ that ceiling ÷ 2.5–3 DB round trips per request. Under load, DB-route latencies cluster at whole seconds (1 s, 2 s, 3 s, 4 s), the signature of per-second operation throttling on a shared/free tier.
4. **Hire endpoints make ~5–6 sequential DB round trips.** At one user they take 260–300 ms, against ~50 ms for one round trip. They degrade first and furthest: p50 4 s at 100 users, vs 2 s for Practice reads.
5. **Stable under realistic load.** A 5-minute soak at 20 users with ~1 s think time had 0 errors, flat p95 of 307 ms, and RSS steady at ~320 MB. A 528 MB burst peak fell back to 295 MB after idle, so there's no leak.
6. **Production capacity is unknown.** These numbers describe the dev Atlas tier. Re-run against a staging cluster on the production tier before quoting capacity.

## Environment

| Item | Value |
|---|---|
| API | Local `node src/server.js`, Node 26, `NODE_ENV=development`, `LOG_LEVEL=info`, single process |
| Overrides for the capacity runs only | `API_RATE_LIMIT_MAX=100000000` (`.env` untouched; the normal dev server was restored afterwards) |
| Database | MongoDB Atlas `cluster0` (dev DB `test`), remote, 51 ms RTT, driver default `maxPoolSize` 100 |
| Redis | local |
| Load generator | `scripts/load-local/load.mjs` (closed loop, keep-alive `fetch`), same machine as the API; `ab` for DB-free routes |
| Auth | Access tokens for the 24 demo users minted with the server's own `signAccessToken` (`scripts/load-local/mint.mjs`); tokens written to a scratch file only |
| Excluded | AI, STT, email, PayU and code-runner routes, and all writes (cost, real inboxes, demo data integrity) |

## Request mix

Weighted, read-only:
- **Practice:** profile, interview list, progress, résumés.
- **Hire:** organizations, assessment list, pipeline overview, assessment report. Sent with `x-organization-id`, spread across owner/admin/recruiter/manager/reviewer accounts in both demo orgs.
- **Public:** candidate assessment landing, billing catalog, readiness.

## Results

### 1. Rate-limit behaviour (real limits, normal dev config)

| Limit | Test | Result |
|---|---|---|
| General API: 300 / 15 min per user | 310 GETs as one user | 300 × 200, then 429 from request 301 ✅ |
| Login: 10 / 15 min per IP | 12 failed logins | 10 × 401, then 429 from attempt 11 ✅ |
| AI limiter on `/api/questions/*`: 30 / 15 min per user | 35 OA-autosave POSTs | 30 × 404 (dummy id, no writes), then 429 from request 31. **Shared with autosave, submit, complete and checkpoint (finding 1)** |

### 2. Step ramp (no think time, 30 s per stage)

| Users | Req/s | p50 ms | p95 ms | p99 ms | Errors | Server CPU avg / max | RSS max |
|---:|---:|---:|---:|---:|---:|---|---:|
| 5 | 33.4 | 106 | 391 | 477 | 0% | 14% / 37% | 258 MB |
| 25 | 35.3 | 857 | 1,896 | 2,159 | 0% | 10% / 18% | 265 MB |
| 50 | 39.6 | 1,001 | 2,960 | 3,847 | 0% | 20% / 38% | 272 MB |
| 100 | 43.4 | 1,966 | 5,003 | 5,898 | 0% | 9% / 24% | 280 MB |
| 200 | — | — | — | — | — | — | — |

The run stopped automatically at 100 users because p95 exceeded 5 s. It never errored. Requests queued instead of failing.

**p50 by endpoint (ms):**

| Endpoint | 5 users | 25 | 50 | 100 |
|---|---:|---:|---:|---:|
| health.readiness (no DB) | 0.9 | 1.8 | 5.2 | 6.7 |
| billing.catalog (no DB) | 0.8 | 1.8 | 3.0 | 5.9 |
| auth.profile (1 round trip) | 51 | 65 | 115 | 982 |
| practice.interviews / progress / resumes | ~105 | ~800 | ~1,000 | ~1,945 |
| candidate.publicAssessment | 105 | 165 | 999 | 1,949 |
| orgs.list | 208 | 1,008 | 1,982 | 3,025 |
| hire.assessments / overview / assessmentReport | 266–288 | 1,108–1,323 | 2,084–2,114 | 4,012–4,055 |

### 3. Where the time goes (100 users)

- **Mongo pool, sampled each second:** 100 of 100 connections checked out the whole time; wait queue 6–36.
- **Raw Atlas `findOne` by `_id`, no app involved:**

| Concurrency | ops/s | p50 ms | p95 ms | max ms |
|---:|---:|---:|---:|---:|
| 1 | 19.5 | 51 | 59 | 69 |
| 10 | 100.9 | 51 | 508 | 752 |
| 50 | 115.1 | 210 | 902 | 1,841 |
| 150 | 140.3 | 1,046 | 1,909 | 3,063 |

### 4. API ceiling on DB-free routes (`ab`, keep-alive, 20,000 requests)

| Route | Concurrency | Req/s | p50 / p99 ms |
|---|---:|---:|---|
| `/health/liveness` | 50 / 200 | 25,914 / 27,374 | 2 / 4 · 7 / 8 |
| `/api/billing/catalog` | 50 / 200 | 18,411 / 18,226 | 3 / 4 · 11 / 15 |

`ab` reports "failed" requests on liveness, but those are length mismatches: the body carries `uptime`/`timestamp`. There were no errors. Heap went 170 MB → 67 MB after 30 s idle.

### 5. Soak (20 users, ~1 s think time, 5 min)

5,279 requests · 17.5 req/s · **0 errors** · p50 107 ms · p95 308 ms · p99 376 ms · max 548 ms. RSS every 10 s: 295 → 317 → 320 MB (flat after warm-up).

## Recommendations

1. **Give Practice interview traffic its own budget (do first).** Take autosave (`/answers`), `/answer`, `/follow-up-answer`, `/complete` and `/system-design/checkpoint` out of the 30/15-min `aiLimiter`, or key them per round with a much higher cap, as the Hire candidate routes already do with `quotas(...)`. Keep the tight limiter for generation endpoints such as `/rounds/suggest` and `prepare`. When a 429 does happen, show it to the user. Today autosave swallows it with `console.debug("OA autosave deferred")`.
2. **Cut DB round trips on authenticated requests.** Every authed call pays one user lookup in `protect`, and Hire adds a membership lookup in `organizationContext`. Cache both briefly, in Redis or in-process for 30–60 s, invalidated on `tokenVersion` or membership change. Then parallelize the independent queries in the Hire list/overview/report controllers (`Promise.all`) and add `.lean()`/projections where documents are only serialized. At ~50 ms per round trip, 5–6 sequential trips are 250–300 ms before any load.
3. **Size the database for the target concurrency.** On this tier, ~40 req/s of the mix (roughly 100–150 active users with think time) is the ceiling. Before launch, run this suite against staging on the production Atlas tier, in the same region as the API, and record the knee.
4. **Make pool saturation visible.** The `mongo_pool_wait_queue` and `mongo_pool_connections{state="checked_out"}` metrics already exist; add an alert when the wait queue stays above 0 for more than 1 minute. Consider a modest `maxPoolSize` and `waitQueueTimeoutMS` so overload fails fast with 503 instead of 5 s+ queues.

## Not covered

- Write paths: attempt start, answer persistence, invitations.
- AI generation and evaluation throughput, BullMQ worker backlog (`WORKER_CONCURRENCY=2`), STT and code runner.
- Static asset/CDN delivery (the Vite dev server isn't representative).
- Multi-instance behaviour with the Redis-backed limiter (production mode only).
- Production. Load against production needs explicit authorization; the earlier bounded public check is in `report.md`.

## Reproduce

```bash
cd server
node ../scripts/load-local/mint.mjs /tmp/fixtures.json        # demo-user tokens → scratch file, never commit
node ../scripts/load-local/limits.mjs /tmp/fixtures.json http://localhost:5000 limits.json   # against a server with normal limits
node ../scripts/load-local/cpquota.mjs /tmp/fixtures.json     # per-round checkpoint quota; needs AI_TURN_RATE_LIMIT_MAX raised so the hourly quota is what's hit
API_RATE_LIMIT_MAX=100000000 LOG_LEVEL=info node src/server.js # separate terminal, capacity runs only
SERVER_PID=<pid> node ../scripts/load-local/load.mjs /tmp/fixtures.json step.json http://localhost:5000 5,25,50,100,200 30 0
SERVER_PID=<pid> node ../scripts/load-local/load.mjs /tmp/fixtures.json soak.json http://localhost:5000 20 300 1000
node ../scripts/load-local/rawdb.mjs                           # raw Atlas ceiling
```

Raw results: `local-api-2026-10-04/step.json`, `soak.json`, `pool100.json`.
