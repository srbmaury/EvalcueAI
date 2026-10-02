// Imported first by vite.config.js: copies VITE_* values from client/.env files into process.env so build-time
// page data (src/utils/featureFlags.js) sees the same flags as the app bundle. Shell/CI variables win.
import process from "node:process";
import { loadEnv } from "vite";

const modeIndex = process.argv.indexOf("--mode");
const mode = modeIndex >= 0 ? process.argv[modeIndex + 1] : process.argv.includes("build") ? "production" : "development";
for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), "VITE_"))) process.env[key] ??= value;
