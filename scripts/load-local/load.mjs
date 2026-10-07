// Closed-loop step load test against a LOCAL EvalcueAI API. Read-heavy, authenticated, no AI/email/payment routes.
// Usage: node load.mjs <fixtures.json> <out.json> [base] [stages e.g. 5,25,50,100,200] [stageSeconds] [thinkMs]
import fs from "node:fs";
const [fixturesPath, outPath, base = "http://localhost:5000", stagesArg = "5,25,50,100,200", stageSecArg = "30", thinkArg = "0"] = process.argv.slice(2);
const fx = JSON.parse(fs.readFileSync(fixturesPath, "utf8"));
const stages = stagesArg.split(",").map(Number);
const stageMs = Number(stageSecArg) * 1000;
const thinkMs = Number(thinkArg);
const serverPid = process.env.SERVER_PID ? Number(process.env.SERVER_PID) : null;

const practiceUsers = fx.users.filter((u) => /candidate/.test(u.email));
const hireUsers = fx.users.filter((u) => u.org && ["owner", "admin", "recruiter", "hiring_manager"].includes(u.role));
const reviewerUsers = fx.users.filter((u) => u.org && u.role === "reviewer");
const assessments = fx.assessments;
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// Weighted request mix (roughly what an active app sees: candidates browsing Practice, recruiters on Hire dashboards).
const MIX = [
  [10, "health.readiness", () => ({ path: "/health/readiness" })],
  [8, "billing.catalog", () => ({ path: "/api/billing/catalog" })],
  [12, "auth.profile", () => ({ path: "/api/auth/profile", user: pick(practiceUsers) })],
  [12, "practice.interviews", () => ({ path: "/api/interviews", user: pick(practiceUsers) })],
  [8, "practice.progress", () => ({ path: "/api/interviews/analytics/progress", user: pick(practiceUsers) })],
  [6, "practice.resumes", () => ({ path: "/api/resumes?page=1&limit=10", user: pick(practiceUsers) })],
  [6, "orgs.list", () => ({ path: "/api/organizations", user: pick(hireUsers) })],
  [10, "hire.assessments", () => { const u = pick(hireUsers); return { path: "/api/assessments", user: u, org: u.org }; }],
  [10, "hire.overview", () => { const u = pick([...hireUsers, ...reviewerUsers]); return { path: "/api/assessments/overview?page=1&limit=20", user: u, org: u.org }; }],
  [8, "hire.assessmentReport", () => { const a = pick(assessments); const u = pick(hireUsers.filter((x) => x.org === a.org)); return { path: `/api/assessments/${a.id}`, user: u, org: u.org }; }],
  [10, "candidate.publicAssessment", () => ({ path: `/api/assessments/public/${pick(assessments).shareToken}` })],
];
const totalWeight = MIX.reduce((s, [w]) => s + w, 0);
const pickRequest = () => { let r = Math.random() * totalWeight; for (const [w, name, make] of MIX) { if ((r -= w) <= 0) return { name, ...make() }; } };

const samples = [];
let stopAll = false;
const resourceSamples = [];

async function one(stage) {
  const req = pickRequest();
  const headers = { "user-agent": "EvalcueAI-local-loadtest/1.0", accept: "application/json" };
  if (req.user) headers.authorization = `Bearer ${req.user.token}`;
  if (req.org) headers["x-organization-id"] = req.org;
  const t0 = performance.now();
  let status = 0, err = "";
  try {
    const res = await fetch(base + req.path, { headers, signal: AbortSignal.timeout(15000) });
    status = res.status;
    await res.arrayBuffer();
  } catch (e) { err = e.name === "TimeoutError" ? "timeout" : (e.cause?.code || e.name); }
  samples.push({ stage, name: req.name, status, ms: performance.now() - t0, err, at: Date.now() });
}

const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return +s[Math.min(s.length - 1, Math.ceil(s.length * p) - 1)].toFixed(1); };
const ok = (x) => x.status >= 200 && x.status < 400;
const summarize = (items, seconds) => {
  const ms = items.map((x) => x.ms);
  const byStatus = {};
  for (const x of items) { const k = x.err || String(x.status); byStatus[k] = (byStatus[k] || 0) + 1; }
  return { requests: items.length, rps: seconds ? +(items.length / seconds).toFixed(1) : null, errorRate: items.length ? +(items.filter((x) => !ok(x)).length / items.length * 100).toFixed(2) : 0, p50: pct(ms, 0.5), p90: pct(ms, 0.9), p95: pct(ms, 0.95), p99: pct(ms, 0.99), max: ms.length ? +Math.max(...ms).toFixed(1) : null, byStatus };
};

async function sampleResources(stage) {
  if (!serverPid) return;
  const { execFileSync } = await import("node:child_process");
  try {
    const [cpu, rss] = execFileSync("ps", ["-o", "%cpu=,rss=", "-p", String(serverPid)]).toString().trim().split(/\s+/).map(Number);
    resourceSamples.push({ stage, cpu, rssMb: Math.round(rss / 1024) });
  } catch { /* process gone */ }
}

const stageResults = [];
for (const vus of stages) {
  if (stopAll) break;
  const startIdx = samples.length;
  const t0 = Date.now();
  const deadline = t0 + stageMs;
  const resTimer = setInterval(() => sampleResources(vus), 1000);
  await Promise.all(Array.from({ length: vus }, async () => {
    while (Date.now() < deadline) {
      await one(vus);
      if (thinkMs) await new Promise((r) => setTimeout(r, thinkMs * (0.5 + Math.random())));
    }
  }));
  clearInterval(resTimer);
  const seconds = (Date.now() - t0) / 1000;
  const items = samples.slice(startIdx);
  const sum = summarize(items, seconds);
  const res = resourceSamples.filter((r) => r.stage === vus);
  sum.serverCpuAvg = res.length ? +(res.reduce((s, r) => s + r.cpu, 0) / res.length).toFixed(0) : null;
  sum.serverCpuMax = res.length ? Math.max(...res.map((r) => r.cpu)) : null;
  sum.serverRssMaxMb = res.length ? Math.max(...res.map((r) => r.rssMb)) : null;
  stageResults.push({ vus, seconds: +seconds.toFixed(1), ...sum });
  console.log(JSON.stringify({ vus, ...sum }));
  if (sum.errorRate > 5 || (sum.p95 ?? 0) > 5000) { console.log(`STOP: thresholds exceeded at ${vus} VUs`); stopAll = true; }
}

const perEndpoint = {};
for (const [, name] of MIX) perEndpoint[name] = summarize(samples.filter((x) => x.name === name));
const perEndpointByStage = {};
for (const st of stageResults) { perEndpointByStage[st.vus] = {}; for (const [, name] of MIX) { const it = samples.filter((x) => x.stage === st.vus && x.name === name); perEndpointByStage[st.vus][name] = { n: it.length, p50: pct(it.map((x) => x.ms), 0.5), p95: pct(it.map((x) => x.ms), 0.95), err: it.filter((x) => !ok(x)).length }; } }
fs.writeFileSync(outPath, JSON.stringify({ base, stages: stageResults, perEndpoint, perEndpointByStage, thinkMs, stageSeconds: stageMs / 1000, finishedAt: new Date().toISOString() }, null, 2));
console.log("written", outPath);
