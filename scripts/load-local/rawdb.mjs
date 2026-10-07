// Raw Atlas probe: concurrent findOne by _id on users, bypassing the app. Read-only.
import path from "node:path"; import { pathToFileURL } from "node:url"; import { createRequire } from "node:module";
const serverDir = process.cwd();
(await import(pathToFileURL(path.join(serverDir,"node_modules/dotenv/lib/main.js")).href)).default.config({ quiet: true });
const mongoose = createRequire(path.join(serverDir,"package.json"))("mongoose");
await mongoose.connect(process.env.MONGO_URI, { maxPoolSize: 200 });
const col = mongoose.connection.db.collection("users");
const ids = (await col.find({}, { projection: { _id: 1 } }).toArray()).map(d => d._id);
for (const conc of [1, 10, 50, 150]) {
  const lat = []; const end = Date.now() + 10000;
  await Promise.all(Array.from({ length: conc }, async () => { while (Date.now() < end) { const t = performance.now(); await col.findOne({ _id: ids[Math.floor(Math.random()*ids.length)] }); lat.push(performance.now() - t); } }));
  lat.sort((a,b)=>a-b); const p = q => lat[Math.min(lat.length-1, Math.ceil(lat.length*q)-1)].toFixed(0);
  const buckets = {}; for (const l of lat) { const b = Math.floor(l/1000); buckets[b+'s'] = (buckets[b+'s']||0)+1; }
  console.log(JSON.stringify({ concurrency: conc, opsPerSec: +(lat.length/10).toFixed(1), p50: +p(.5), p95: +p(.95), max: +lat.at(-1).toFixed(0), secondBuckets: buckets }));
}
await mongoose.disconnect();
