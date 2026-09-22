import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import {
    PRODUCT_RESOURCE_PAGES,
    resourcePathFor,
    resourcePathsForSurface,
} from "./src/utils/productResourcePages.js";
import {
    SEARCH_LANDING_PAGES,
    searchLandingPaths,
} from "./src/utils/searchLandingPages.js";

const LANDING_INDEXABLE_ROUTES = [
    "/",
    ...searchLandingPaths(),
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

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
})[character]);

const searchPageForRoute = (route) => SEARCH_LANDING_PAGES.find((page) => page.path === route) || null;
const resourcePageForRoute = (route) => PRODUCT_RESOURCE_PAGES.find((page) => resourcePathFor(page) === route) || null;

const STATIC_PRODUCT_COPY = {
    "/": {
        title: "AI Interview Practice for Software Engineers | Evalcue AI",
        description: "Practice AI mock interviews for software engineering roles with adaptive follow-ups, coding, system design, debugging, resume context, and structured feedback.",
        heading: "AI interview practice for software engineers. Structured technical hiring for teams.",
        intro: "Practice realistic coding, system-design, debugging, and technical interviews with adaptive AI follow-ups, or build evidence-focused engineering assessments for your hiring team.",
    },
    "/practice": {
        title: "AI Technical Interview Practice for Software Engineers | Evalcue AI",
        description: "Practice role-specific software engineering interviews with adaptive follow-ups, coding rounds, system design, resume context, and evidence-backed feedback.",
        heading: "AI technical interview practice for software engineers",
        intro: "Run role-specific mock interviews across technical discussion, coding, system design, debugging, and project depth, then review the evidence and feedback from each session.",
    },
    "/hire": {
        title: "Structured Technical Hiring & AI Candidate Assessments | Evalcue AI",
        description: "Create structured engineering assessments, invite candidates, run adaptive technical interviews, and review evidence-rich scorecards with human-controlled hiring decisions.",
        heading: "Structured technical hiring for software engineering teams",
        intro: "Create role-specific technical assessments across discussion, coding, system design, and debugging while keeping candidate evidence review and employment decisions human-controlled.",
    },
};

const staticConfigForRoute = (route) => {
    const searchPage = searchPageForRoute(route);
    if (searchPage) {
        return {
            title: searchPage.metaTitle,
            description: searchPage.description,
            heading: searchPage.title,
            schema: searchPage.schema || "WebPage",
            searchPage,
        };
    }

    const resourcePage = resourcePageForRoute(route);
    if (resourcePage) {
        return {
            title: resourcePage.metaTitle,
            description: resourcePage.description,
            heading: resourcePage.title,
            schema: "TechArticle",
            resourcePage,
        };
    }

    return STATIC_PRODUCT_COPY[route] || null;
};

const renderSearchPageMarkup = (page, practiceOrigin = "") => `
<main data-static-seo="search-landing">
  <nav aria-label="Breadcrumb"><a href="/">Evalcue AI</a></nav>
  <p>${escapeHtml(page.eyebrow)}</p>
  <h1>${escapeHtml(page.title)}</h1>
  <p>${escapeHtml(page.intro)}</p>
  ${page.sections.map((section) => `
    <section>
      <h2>${escapeHtml(section.heading)}</h2>
      <p>${escapeHtml(section.body)}</p>
      <ul>${section.points.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul>
    </section>
  `).join("")}
  <section>
    <h2>Frequently asked questions</h2>
    ${page.faq.map(([question, answer]) => `<h3>${escapeHtml(question)}</h3><p>${escapeHtml(answer)}</p>`).join("")}
  </section>
  <section>
    <h2>Related interview practice</h2>
    <ul>
      ${page.related.map((slug) => {
          const related = SEARCH_LANDING_PAGES.find((candidate) => candidate.slug === slug);
          return related ? `<li><a href="${escapeHtml(related.path)}">${escapeHtml(related.title)}</a></li>` : "";
      }).join("")}
    </ul>
  </section>
  <p><a href="${escapeHtml(`${practiceOrigin || ""}/practice/resources/${page.practiceResource}`)}">Start AI interview practice</a></p>
</main>`;

const renderResourcePageMarkup = (page) => `
<main data-static-seo="product-resource">
  <nav aria-label="Breadcrumb"><a href="${page.surface === "hiring" ? "/hire" : "/practice"}">Evalcue AI ${page.surface === "hiring" ? "Hire" : "Practice"}</a></nav>
  <p>${escapeHtml(page.eyebrow)}</p>
  <h1>${escapeHtml(page.title)}</h1>
  <p>${escapeHtml(page.intro)}</p>
  <section>
    <h2>${page.surface === "hiring" ? "Assessment templates" : "Practice options"}</h2>
    <p>${escapeHtml(page.description)}</p>
    ${page.examples.map((example) => `
      <article>
        <h3>${escapeHtml(example.title)}</h3>
        <p>${escapeHtml(example.summary)}</p>
      </article>
    `).join("")}
  </section>
  <section>
    <h2>Related resources</h2>
    <ul>
      ${page.related.map((slug) => {
          const related = PRODUCT_RESOURCE_PAGES.find((candidate) => candidate.surface === page.surface && candidate.slug === slug);
          return related ? `<li><a href="${escapeHtml(resourcePathFor(related))}">${escapeHtml(related.title)}</a></li>` : "";
      }).join("")}
    </ul>
  </section>
</main>`;

const renderProductMarkup = (route, config) => {
    const links = route === "/"
        ? SEARCH_LANDING_PAGES.map((page) => [page.path, page.title])
        : route === "/practice"
            ? PRODUCT_RESOURCE_PAGES.filter((page) => page.surface === "practice").map((page) => [resourcePathFor(page), page.title])
            : PRODUCT_RESOURCE_PAGES.filter((page) => page.surface === "hiring").map((page) => [resourcePathFor(page), page.title]);

    return `
<main data-static-seo="product">
  <h1>${escapeHtml(config.heading)}</h1>
  <p>${escapeHtml(config.intro)}</p>
  <section>
    <h2>${route === "/hire" ? "Technical hiring resources" : "Interview practice resources"}</h2>
    <ul>${links.map(([href, label]) => `<li><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></li>`).join("")}</ul>
  </section>
</main>`;
};

const renderStaticMarkup = (route, config, surfaceOrigins = {}) => {
    if (config.searchPage) return renderSearchPageMarkup(config.searchPage, surfaceOrigins.practice);
    if (config.resourcePage) return renderResourcePageMarkup(config.resourcePage);
    return renderProductMarkup(route, config);
};

const structuredDataForStaticRoute = (route, config, canonicalUrl) => {
    if (route === "/") {
        return {
            "@context": "https://schema.org",
            "@graph": [
                { "@type": "WebSite", name: "Evalcue AI", url: canonicalUrl, description: config.description },
                { "@type": "Organization", name: "Evalcue AI", url: canonicalUrl },
            ],
        };
    }

    if (route === "/practice" || route === "/hire") {
        return {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: config.heading,
            description: config.description,
            url: canonicalUrl,
            applicationCategory: route === "/practice" ? "EducationalApplication" : "BusinessApplication",
            operatingSystem: "Web",
            publisher: { "@type": "Organization", name: "Evalcue AI" },
        };
    }

    return {
        "@context": "https://schema.org",
        "@type": config.schema || "WebPage",
        name: config.heading,
        headline: config.schema === "TechArticle" ? config.heading : undefined,
        description: config.description,
        url: canonicalUrl,
        publisher: { "@type": "Organization", name: "Evalcue AI" },
    };
};

const applyStaticRouteHtml = (baseHtml, route, origin, config, surfaceOrigins = {}) => {
    const canonicalUrl = `${origin}${route}`;
    const markup = renderStaticMarkup(route, config, surfaceOrigins);
    const structuredData = JSON.stringify(structuredDataForStaticRoute(route, config, canonicalUrl)).replace(/</g, "\\u003c");

    return baseHtml
        .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(config.title)}</title>`)
        .replace(/(<meta name="description" content=")[^"]*(" \/>)/, `$1${escapeHtml(config.description)}$2`)
        .replace(/(<meta property="og:title" content=")[^"]*(" \/>)/, `$1${escapeHtml(config.title)}$2`)
        .replace(/(<meta property="og:description" content=")[^"]*(" \/>)/, `$1${escapeHtml(config.description)}$2`)
        .replace(/(<meta name="twitter:title" content=")[^"]*(" \/>)/, `$1${escapeHtml(config.title)}$2`)
        .replace(/(<meta name="twitter:description" content=")[^"]*(" \/>)/, `$1${escapeHtml(config.description)}$2`)
        .replace(
            "</head>",
            `    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <script type="application/ld+json">${structuredData}</script>
  </head>`,
        )
        .replace('<div id="root"></div>', `<div id="root">${markup}</div>`);
};

const writeStaticRoute = async (outDir, route, html) => {
    if (route === "/") {
        await writeFile(path.join(outDir, "index.html"), html);
        return;
    }

    const routeDir = path.join(outDir, route.replace(/^\/+/, ""));
    await mkdir(routeDir, { recursive: true });
    await writeFile(path.join(routeDir, "index.html"), html);
};

const seoFilesPlugin = (origin, routes, surfaceOrigins = {}) => ({
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

        const baseHtml = await readFile(path.join(outDir, "index.html"), "utf8");
        const staticRouteWrites = routes
            .map((route) => [route, staticConfigForRoute(route)])
            .filter(([, config]) => Boolean(config))
            .map(([route, config]) => writeStaticRoute(
                outDir,
                route,
                applyStaticRouteHtml(baseHtml, route, origin, config, surfaceOrigins),
            ));

        await Promise.all([
            writeFile(path.join(outDir, "sitemap.xml"), sitemap),
            writeFile(path.join(outDir, "robots.txt"), robots),
            ...staticRouteWrites,
        ]);
    },
});

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");
    const publicOrigin = normalizePublicOrigin(env.VITE_PUBLIC_ORIGIN);
    const surfaceOrigins = {
        practice: normalizePublicOrigin(env.VITE_PRACTICE_ORIGIN),
    };
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
        plugins: [react(), seoFilesPlugin(publicOrigin, indexableRoutes, surfaceOrigins)],
        build: {
            manifest: true,
            rollupOptions: {
                output: {
                    manualChunks(id) {
                        // Heavy interview libraries are already behind lazy routes/components.
                        // Forcing them into named chunks can pull shared entry dependencies into
                        // those chunks and make unrelated pages preload the heavy libraries.
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
