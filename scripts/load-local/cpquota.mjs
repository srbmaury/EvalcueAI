// Counts how many system-design checkpoints one Practice round gets per hour (fresh fake round id; no data written).
import fs from "node:fs";
const fx = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const token = fx.users.find((u) => u.email.startsWith("candidate06")).token;
const round = "0000000000000000000000" + String(Date.now() % 100).padStart(2, "0");
const st = [];
for (let i = 0; i < 250; i++) {
  const r = await fetch(`http://localhost:5000/api/questions/${round}/system-design/checkpoint`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", origin: "http://localhost:5173" }, body: JSON.stringify({ transcript: "x" }) });
  st.push(r.status); await r.arrayBuffer();
}
const t = st.reduce((m, s) => (m[s] = (m[s] || 0) + 1, m), {});
console.log(JSON.stringify({ statuses: t, first429: st.indexOf(429) + 1 }));
