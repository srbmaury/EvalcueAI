// Mints access tokens for demo users via the server's own signer. Writes to fixtures.json (scratchpad only).
import path from "node:path"; import { pathToFileURL } from "node:url"; import { createRequire } from "node:module"; import fs from "node:fs";
const serverDir = process.cwd();
(await import(pathToFileURL(path.join(serverDir,"node_modules/dotenv/lib/main.js")).href)).default.config({ quiet: true });
const mongoose = createRequire(path.join(serverDir,"package.json"))("mongoose");
const { signAccessToken } = await import(pathToFileURL(path.join(serverDir,"src/utils/tokens.js")).href);
await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;
const users = await db.collection("users").find({ email: /@srbmaury\.com$/ }, { projection: { email: 1, tokenVersion: 1 } }).toArray();
const memberships = await db.collection("organizationmemberships").find({}).toArray();
const assessments = await db.collection("assessments").find({}, { projection: { shareToken: 1, organization: 1, status: 1 } }).toArray();
const out = { users: users.map(u => {
  const m = memberships.find(x => String(x.user) === String(u._id) && (x.status ?? "active") === "active");
  return { email: u.email, token: signAccessToken(u._id, u.tokenVersion), org: m ? String(m.organization) : null, role: m?.role || null };
}), assessments: assessments.map(a => ({ id: String(a._id), shareToken: a.shareToken, status: a.status, org: String(a.organization) })) };
fs.writeFileSync(process.argv[2], JSON.stringify(out));
console.log(`users=${out.users.length} orgMembers=${out.users.filter(u=>u.org).length} roles=${[...new Set(out.users.map(u=>u.role))].join("/")} assessments=${out.assessments.length}`);
await mongoose.disconnect();
