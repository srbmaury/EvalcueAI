import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const dist = path.resolve(process.cwd(), "dist");
const html = await readFile(path.join(dist, "index.html"), "utf8");
const heavyFeaturePattern = /(?:excalidraw|monaco|vision)[^"']*\.(?:js|css)/i;

if (heavyFeaturePattern.test(html)) {
    throw new Error("The entry HTML eagerly loads an interview-only Excalidraw, Monaco, or vision asset");
}

const entryMatch = html.match(/<script[^>]+src="\/assets\/([^"]+\.js)"/);
if (!entryMatch) throw new Error("Could not identify the production entry script");

const entryBytes = (await stat(path.join(dist, "assets", entryMatch[1]))).size;
const entryLimitBytes = 400 * 1024;
if (entryBytes > entryLimitBytes) {
    throw new Error(`Entry script is ${entryBytes} bytes; limit is ${entryLimitBytes} bytes`);
}

console.log(`Entry bundle check passed (${entryBytes} bytes; heavy interview assets remain lazy)`);

const assets = await readdir(path.join(dist, "assets"));
for (const routeChunkPrefix of ["DashboardPage-", "HiringWorkspacePage-", "LoginPage-"]) {
    const routeChunk = assets.find((name) => name.startsWith(routeChunkPrefix) && name.endsWith(".js"));
    if (!routeChunk) throw new Error(`Could not identify ${routeChunkPrefix} route chunk`);
    const source = await readFile(path.join(dist, "assets", routeChunk), "utf8");
    const heavyImportPattern = /(?:from|import)\s*\(?["'][^"']*(?:excalidraw|monaco|vision_bundle|percentages-BXM)/i;
    if (heavyImportPattern.test(source)) {
        throw new Error(`${routeChunkPrefix} eagerly references an interview-only heavy asset`);
    }
}

console.log("Logged-in dashboard, hiring workspace, and login chunks remain isolated from heavy interview assets");

const manifest = JSON.parse(await readFile(path.join(dist, ".vite", "manifest.json"), "utf8"));
const maxPageChunkBytes = 100 * 1024;
const maxStaticDependencyBytes = 500 * 1024;

const inspectStaticImports = async (entryKey, seen = new Set()) => {
    if (seen.has(entryKey)) return;
    seen.add(entryKey);
    const record = manifest[entryKey];
    if (!record?.file) return;
    const bytes = (await stat(path.join(dist, record.file))).size;
    if (entryKey.startsWith("src/pages/") && bytes > maxPageChunkBytes) {
        throw new Error(`${entryKey} is ${bytes} bytes; page chunk limit is ${maxPageChunkBytes} bytes`);
    }
    if (entryKey !== "index.html" && bytes > maxStaticDependencyBytes) {
        throw new Error(`${entryKey} is a ${bytes}-byte static dependency of a normal page`);
    }
    for (const importedKey of record.imports || []) await inspectStaticImports(importedKey, seen);
};

for (const key of Object.keys(manifest).filter((key) => key.startsWith("src/pages/"))) {
    await inspectStaticImports(key);
}

console.log("All page chunks and static dependency closures stay within performance budgets");
