// Verifies the real rate limits on a LOCAL API started with production-like limit settings.
// Each check uses a different demo user so per-user limiter buckets don't interfere.
// Question routes are hit with a non-existent round id: the limiter runs first, the route then 404s, nothing is written.
import fs from "node:fs";
const fx = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const base = process.argv[3] || "http://localhost:5000";
const tok = (e) => fx.users.find((u) => u.email.startsWith(e)).token;
const tally = (arr) => arr.reduce((m, s) => (m[s] = (m[s] || 0) + 1, m), {});
const firstOf = (arr, code) => { const i = arr.indexOf(code); return i < 0 ? "never" : i + 1; };
const origin = "http://localhost:5173";
const ROUND = "000000000000000000000000";
const results = {};

async function hit(n, { method = "GET", path, user, body }) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const headers = { origin };
    if (user) headers.authorization = `Bearer ${tok(user)}`;
    if (body) headers["content-type"] = "application/json";
    const r = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    out.push(r.status); await r.arrayBuffer();
  }
  return out;
}
const report = (name, statuses, expectation) => {
  results[name] = { statuses: tally(statuses), first429: firstOf(statuses, 429), expectation };
  console.log(`${name}: ${JSON.stringify(tally(statuses))} first429=${firstOf(statuses, 429)}  (expected: ${expectation})`);
};

// 1. General API limiter (300 / 15 min per user).
report("apiLimiter GET /api/auth/profile x310", await hit(310, { path: "/api/auth/profile", user: "candidate10" }), "429 from request 301");

// 2. Login limiter (10 / 15 min per IP), non-existent account.
report("loginLimiter POST /api/auth/login x12", await hit(12, { method: "POST", path: "/api/auth/login", body: { email: "no-such-user@srbmaury.com", password: "WrongPassword123!" } }), "429 from attempt 11");

// 3. OA autosave: no AI limit any more; only the general limiter applies.
report("autosave POST /api/questions/:id/answers x60", await hit(60, { method: "POST", path: `/api/questions/${ROUND}/answers`, user: "candidate09", body: { answers: ["x"] } }), "no 429 (was 429 from request 31)");

// 4. Interview turns share the new turn budget (AI_TURN_RATE_LIMIT_MAX, default 150 / 15 min).
report("turn POST /api/questions/:id/answer x155", await hit(155, { method: "POST", path: `/api/questions/${ROUND}/answer`, user: "candidate08", body: { index: 0, answer: "x" } }), "429 from request 151");

// 5. Generation keeps the tight AI limit (30 / 15 min). /clarify on a missing round is rejected before any AI call.
report("generation POST /api/questions/:id/clarify x35", await hit(35, { method: "POST", path: `/api/questions/${ROUND}/clarify`, user: "candidate07", body: { message: "x" } }), "429 from request 31");

// 6. Turn and generation budgets are separate: after (5), turns for the same user still work.
report("turn after generation exhausted, same user x5", await hit(5, { method: "POST", path: `/api/questions/${ROUND}/complete`, user: "candidate07" }), "no 429");

if (process.argv[4]) fs.writeFileSync(process.argv[4], JSON.stringify(results, null, 2));
