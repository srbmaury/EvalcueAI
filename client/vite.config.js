import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resourcePathsForSurface } from "./src/utils/productResourcePages.js";

const LANDING_INDEXABLE_ROUTES = [
    "/",
    "/docs",
    "/docs/technical-hiring/structured-technical-assessments",
    "/docs/technical-hiring/system-design-interviews",
    "/docs/technical-hiring/interview-scorecards",
    "/docs/candidates/ai-interview-practice",
    "/docs/security/human-review-and-integrity-signals",
    "/docs/hiring/oidc-sso",
    "/privacy",
    "/terms",
];

const PRACTICE_INDEXABLE_ROUTES = ["/practice", ...resourcePathsForSurface("practice")];
const HIRING_INDEXABLE_ROUTES = ["/hire", ...resourcePathsForSurface("hiring")];

const INDEXABLE_ROUTES_BY_SURFACE = Object.freeze({
    landing: LANDING_INDEXABLE_ROUTES,
    practice: PRACTICE_INDEXABLE_ROUTES,
    hiring: HIRING_INDEXABLE_ROUTES,
});

const ALL_INDEXABLE_ROUTES = [
    ...LANDING_INDEXABLE_ROUTES,
    ...PRACTICE_INDEXABLE_ROUTES,
    ...HIRING_INDEXABLE_ROUTES,
];

const normalizePublicOrigin = (raw) => {
    const value = String(raw || "").trim();
    if (!value) return "";
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.pathname !== "/" || url.search || url.hash) {
        throw new Error("VITE_PUBLIC_ORIGIN must be an origin only, for example https://evalcue.example");
    }
    return url.origin;
};

const seoFilesPlugin = (origin, routes) => ({
    name: "evalcue-seo-files",
    async closeBundle() {
        if (!origin) return;
        const outDir = path.resolve(process.cwd(), "dist");
        await mkdir(outDir, { recursive: true });
        const urls = routes.map((route) => `  <url><loc>${origin}${route}</loc></url>`).join("\n");
        const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
        const robots = [
            "User-agent: *",
            "Allow: /",
            `Sitemap: ${origin}/sitemap.xml`,
            "",
        ].join("\n");
        await Promise.all([
            writeFile(path.join(outDir, "sitemap.xml"), sitemap),
            writeFile(path.join(outDir, "robots.txt"), robots),
        ]);
    },
});

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");
    const publicOrigin = normalizePublicOrigin(env.VITE_PUBLIC_ORIGIN);
    const appSurface = ["landing", "practice", "hiring"].includes(env.VITE_APP_SURFACE)
        ? env.VITE_APP_SURFACE
        : null;
    const indexableRoutes = appSurface
        ? INDEXABLE_ROUTES_BY_SURFACE[appSurface]
        : ALL_INDEXABLE_ROUTES;

    return {
        test: {
            environment: "jsdom",
            globals: true,
            exclude: ["e2e/**", "node_modules/**"],
        },
        plugins: [react(), seoFilesPlugin(publicOrigin, indexableRoutes)],
        build: {
            rollupOptions: {
                output: {
                    manualChunks(id) {
                        // Keep genuinely heavy, route-specific feature libraries isolated so
                        // they are only requested when the corresponding interview feature loads.
                        if (id.includes("monaco-editor") || id.includes("react-monaco-editor")) return "monaco";
                        if (id.includes("@excalidraw/excalidraw")) return "excalidraw";
                        if (id.includes("@mediapipe/tasks-vision")) return "vision";
                        if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return "react";

                        // Do not force all MUI/Emotion modules into one global chunk. Rollup can
                        // now keep route-only components/icons with the routes that use them.
                    },
                },
            },
        },
        server: {
            headers: {
                "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
            },
            proxy: {
                "/api": {
                    target: "http://localhost:5000",
                    changeOrigin: true,
                    secure: false,
                },
            },
        },
    };
});
