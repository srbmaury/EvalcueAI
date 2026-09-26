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
import {
    BRAND_DESCRIPTION,
    BRAND_NAME,
    BRAND_POSITIONING,
    BRAND_TAGLINE,
    BRAND_URLS,
    HIRING_PLAN_SUMMARY,
    INTERVIEW_TYPES,
    PRACTICE_PLANS,
    breadcrumbSchema,
    faqSchema,
    organizationSchema,
    publisherRef,
    softwareApplicationSchema,
} from "./src/utils/brandEntity.js";

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

const APP_SURFACE_ORIGINS = Object.freeze({
    landing: "https://evalcueai.com",
    practice: "https://practice.evalcueai.com",
    hiring: "https://hiring.evalcueai.com",
});

// Mirrors PublicRouteSeo: VITE_PUBLIC_ORIGIN overrides only the landing origin, while Practice and
// Hiring use their own surface origin (VITE_PRACTICE_ORIGIN / VITE_HIRING_ORIGIN, else production).
const originForSurface = (surface, publicOrigin = "", surfaceOrigins = {}) => (
    surface === "landing"
        ? publicOrigin || APP_SURFACE_ORIGINS.landing
        : surfaceOrigins[surface] || APP_SURFACE_ORIGINS[surface] || publicOrigin
);

const canonicalRouteUrl = (route, surface, publicOrigin, surfaceOrigins = {}) => `${originForSurface(surface, publicOrigin, surfaceOrigins)}${route}`;

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
        title: "EvalcueAI | AI Coding, System Design & Debugging Interviews for Engineers",
        description: "EvalcueAI is AI interview practice and structured technical hiring for software engineers: coding, system design, debugging, and technical interviews with adaptive AI follow-ups.",
        heading: "AI interview practice and structured technical hiring for software engineers",
        intro: "Practice realistic coding, system-design, debugging, and technical interviews with adaptive AI follow-ups, or build evidence-focused engineering assessments for your hiring team.",
    },
    "/practice": {
        title: "AI Technical Interview Practice for Software Engineers | EvalcueAI",
        description: "Practice role-specific software engineering interviews with adaptive follow-ups, coding rounds, system design, resume context, and evidence-backed feedback.",
        heading: "AI technical interview practice for software engineers",
        intro: "Run role-specific mock interviews across technical discussion, coding, system design, debugging, and project depth, then review the evidence and feedback from each session.",
    },
    "/hire": {
        title: "Structured Technical Hiring & AI Candidate Assessments | EvalcueAI",
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

const renderSearchPageMarkup = (page, practiceOrigin = APP_SURFACE_ORIGINS.practice, hiringOrigin = APP_SURFACE_ORIGINS.hiring) => `
<main data-static-seo="search-landing">
  <nav aria-label="Breadcrumb"><a href="${APP_SURFACE_ORIGINS.landing}/">${BRAND_NAME}</a></nav>
  <p>${escapeHtml(page.eyebrow)}</p>
  <h1>${escapeHtml(page.title)}</h1>
  <p>${escapeHtml(page.intro)}</p>
  ${page.audience ? `<section><h2>Who it's for</h2><p>${escapeHtml(page.audience)}</p></section>` : ""}
  ${page.sections.map((section) => `
    <section>
      <h2>${escapeHtml(section.heading)}</h2>
      <p>${escapeHtml(section.body)}</p>
      <ul>${section.points.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul>
    </section>
  `).join("")}
  ${page.example ? `
  <section>
    <h2>${escapeHtml(page.example.heading)}</h2>
    <p>${escapeHtml(page.example.intro)}</p>
    <dl>${page.example.turns.map(([speaker, text]) => `<dt>${escapeHtml(speaker)}</dt><dd>${escapeHtml(text)}</dd>`).join("")}</dl>
    <h3>What ${BRAND_NAME} evaluates here</h3>
    <ul>${page.example.evaluates.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
  </section>` : ""}
  ${page.schema !== "TechArticle" ? `
  <section>
    <h2>Pricing</h2>
    <ul>
      ${PRACTICE_PLANS.map((plan) => `<li>Practice ${escapeHtml(plan.name)}: ${escapeHtml(plan.summary)}</li>`).join("")}
      <li>Hire: ${escapeHtml(HIRING_PLAN_SUMMARY)}</li>
    </ul>
  </section>` : ""}
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
  <p><a href="${escapeHtml(page.cta?.surface === "hiring"
      ? `${hiringOrigin || APP_SURFACE_ORIGINS.hiring}${page.cta.path}`
      : `${practiceOrigin || APP_SURFACE_ORIGINS.practice}/practice/resources/${page.practiceResource}`)}">${escapeHtml(page.cta?.label || "Start AI interview practice")}</a></p>
</main>`;

const renderResourcePageMarkup = (page) => `
<main data-static-seo="product-resource">
  <nav aria-label="Breadcrumb"><a href="${APP_SURFACE_ORIGINS.landing}/">Home</a> › <a href="${page.surface === "hiring" ? APP_SURFACE_ORIGINS.hiring : APP_SURFACE_ORIGINS.practice}/${page.surface === "hiring" ? "hire" : "practice"}">EvalcueAI ${page.surface === "hiring" ? "Hire" : "Practice"}</a></nav>
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
          return related ? `<li><a href="${escapeHtml(`${page.surface === "hiring" ? APP_SURFACE_ORIGINS.hiring : APP_SURFACE_ORIGINS.practice}${resourcePathFor(related)}`)}">${escapeHtml(related.title)}</a></li>` : "";
      }).join("")}
    </ul>
  </section>
  <p><a href="${APP_SURFACE_ORIGINS.landing}/docs">Product documentation</a> · <a href="${APP_SURFACE_ORIGINS.landing}/">Main website</a></p>
</main>`;

const renderProductMarkup = (route, config, surface) => {
    const baseOrigin = APP_SURFACE_ORIGINS[surface] || "";
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
    <ul>${links.map(([href, label]) => {
          const destination = route === "/"
              ? `${APP_SURFACE_ORIGINS.landing}${href}`
              : `${baseOrigin}${href}`;
          return `<li><a href="${escapeHtml(destination)}">${escapeHtml(label)}</a></li>`;
      }).join("")}</ul>
  </section>
  ${route === "/practice" || route === "/hire" ? `<p><a href="${APP_SURFACE_ORIGINS.landing}/">EvalcueAI home</a></p>` : ""}
</main>`;
};

const renderStaticMarkup = (route, config, surfaceOrigins = {}) => {
    if (config.searchPage) return renderSearchPageMarkup(config.searchPage, surfaceOrigins.practice, surfaceOrigins.hiring);
    if (config.resourcePage) return renderResourcePageMarkup(config.resourcePage);
    const surface = route === "/practice" ? "practice" : route === "/hire" ? "hiring" : "landing";
    return renderProductMarkup(route, config, surface);
};

const structuredDataForStaticRoute = (route, config, canonicalUrl) => {
    const graph = [organizationSchema()];
    if (route === "/") {
        graph.push(
            { "@type": "WebSite", "@id": `${BRAND_URLS.landing}/#website`, name: BRAND_NAME, alternateName: "Evalcue", url: canonicalUrl, description: config.description, publisher: publisherRef() },
            softwareApplicationSchema(),
        );
    } else if (route === "/practice" || route === "/hire") {
        graph.push({
            "@type": "SoftwareApplication",
            name: route === "/practice" ? `${BRAND_NAME} Practice` : `${BRAND_NAME} Hire`,
            description: config.description,
            url: canonicalUrl,
            applicationCategory: route === "/practice" ? "EducationalApplication" : "BusinessApplication",
            operatingSystem: "Web",
            isPartOf: { "@id": `${BRAND_URLS.landing}/#software` },
            publisher: publisherRef(),
        });
    } else {
        graph.push({
            "@type": config.schema || "WebPage",
            name: config.heading,
            headline: config.schema === "TechArticle" ? config.heading : undefined,
            description: config.description,
            url: canonicalUrl,
            publisher: publisherRef(),
            about: config.searchPage ? { "@id": `${BRAND_URLS.landing}/#software` } : undefined,
        });
        graph.push(breadcrumbSchema([[BRAND_NAME, `${BRAND_URLS.landing}/`], [config.heading, canonicalUrl]]));
        const faq = config.searchPage ? faqSchema(config.searchPage.faq) : null;
        if (faq) graph.push(faq);
    }
    return { "@context": "https://schema.org", "@graph": graph };
};

// /llms.txt: a plain-language product summary for AI assistants and answer engines (llmstxt.org).
const renderLlmsTxt = () => [
    `# ${BRAND_NAME}`,
    "",
    `> ${BRAND_NAME} — ${BRAND_TAGLINE}. ${BRAND_POSITIONING}`,
    "",
    BRAND_DESCRIPTION,
    "",
    `${BRAND_NAME} is written as one word. It is not EvalAI, the open-source machine-learning benchmark platform.`,
    "",
    "## Products",
    "",
    `- [${BRAND_NAME} Practice](${BRAND_URLS.practice}/practice): AI interview practice for software engineers.`,
    `- [${BRAND_NAME} Hire](${BRAND_URLS.hiring}/hire): structured engineering assessments with human-controlled hiring decisions.`,
    "",
    "## Supported interview types",
    "",
    ...INTERVIEW_TYPES.map((item) => `- ${item}`),
    "",
    "## Pricing",
    "",
    ...PRACTICE_PLANS.map((plan) => `- Practice ${plan.name}: ${plan.summary}`),
    `- Hire: ${HIRING_PLAN_SUMMARY}`,
    "",
    "## Key pages",
    "",
    ...SEARCH_LANDING_PAGES.filter((page) => page.schema !== "TechArticle" || page.slug === "ai-interview-evaluation-methodology")
        .map((page) => `- [${page.title}](${BRAND_URLS.landing}${page.path}): ${page.description}`),
    "",
    "## Interview guides",
    "",
    ...SEARCH_LANDING_PAGES.filter((page) => page.schema === "TechArticle" && page.slug !== "ai-interview-evaluation-methodology")
        .map((page) => `- [${page.title}](${BRAND_URLS.landing}${page.path}): ${page.description}`),
    "",
    "## Official URLs",
    "",
    `- Website: ${BRAND_URLS.landing}/`,
    `- Documentation: ${BRAND_URLS.docs}`,
    `- About: ${BRAND_URLS.about}`,
    `- Evaluation methodology: ${BRAND_URLS.methodology}`,
    `- Source code: ${BRAND_URLS.source}`,
    "",
].join("\n");

const applyStaticRouteHtml = (baseHtml, route, origin, config, surfaceOrigins = {}, surface = "landing") => {
    const canonicalUrl = canonicalRouteUrl(route, surface, origin, surfaceOrigins);
    const markup = renderStaticMarkup(route, config, surfaceOrigins);
    const structuredData = JSON.stringify(structuredDataForStaticRoute(route, config, canonicalUrl)).replace(/</g, "\\u003c");

    return baseHtml
        .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(config.title)}</title>`)
        .replace(/(<meta name="description" content=")[^"]*(" \/>)/, `$1${escapeHtml(config.description)}$2`)
        .replace(/(<meta property="og:title" content=")[^"]*(" \/>)/, `$1${escapeHtml(config.title)}$2`)
        .replace(/(<meta property="og:description" content=")[^"]*(" \/>)/, `$1${escapeHtml(config.description)}$2`)
        .replace(/(<meta name="twitter:title" content=")[^"]*(" \/>)/, `$1${escapeHtml(config.title)}$2`)
        .replace(/(<meta name="twitter:description" content=")[^"]*(" \/>)/, `$1${escapeHtml(config.description)}$2`)
        .replace(/<meta name="robots" content="[^"]*" \/>/, '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />')
        .replace(/<meta property="og:type" content="[^"]*" \/>/, `<meta property="og:type" content="${config.schema === "TechArticle" ? "article" : "website"}" />`)
        .replace(/<meta name="twitter:card" content="[^"]*" \/>/, '<meta name="twitter:card" content="summary_large_image" />')
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

const seoFilesPlugin = (origin, routes, surfaceOrigins = {}, appSurface = null) => ({
    name: "evalcue-seo-files",
    async closeBundle() {
        if (!origin) return;
        const outDir = path.resolve(process.cwd(), "dist");
        await mkdir(outDir, { recursive: true });

        // appSurface comes from loadEnv, so a surface set in client/.env works as well as a CI env var.
        const deploymentSurface = appSurface || "landing";
        const urls = routes.map((route) => `  <url><loc>${escapeHtml(canonicalRouteUrl(route, deploymentSurface, origin, surfaceOrigins))}</loc></url>`).join("\n");
        const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
        const robots = [
            "User-agent: *",
            "Allow: /",
            `Sitemap: ${originForSurface(deploymentSurface, origin, surfaceOrigins)}/sitemap.xml`,
            ...(deploymentSurface === "landing"
                ? [
                    `Sitemap: ${APP_SURFACE_ORIGINS.practice}/sitemap.xml`,
                    `Sitemap: ${APP_SURFACE_ORIGINS.hiring}/sitemap.xml`,
                ]
                : []),
            "",
        ].join("\n");

        const baseHtml = await readFile(path.join(outDir, "index.html"), "utf8");
        const staticRouteWrites = routes
            .map((route) => [route, staticConfigForRoute(route)])
            .filter(([, config]) => Boolean(config))
            .map(([route, config]) => writeStaticRoute(
                outDir,
                route,
                applyStaticRouteHtml(baseHtml, route, origin, config, surfaceOrigins, deploymentSurface),
            ));

        await Promise.all([
            writeFile(path.join(outDir, "sitemap.xml"), sitemap),
            writeFile(path.join(outDir, "robots.txt"), robots),
            ...(deploymentSurface === "landing" ? [writeFile(path.join(outDir, "llms.txt"), renderLlmsTxt())] : []),
            ...staticRouteWrites,
        ]);
    },
});

// Route metadata for the always-loaded SEO components. Exposing only titles and descriptions keeps
// the long-form landing and resource page copy out of the entry bundle; the pages load it lazily.
const SEO_ROUTE_META_ID = "virtual:seo-route-meta";
const RESOLVED_SEO_ROUTE_META_ID = `\0${SEO_ROUTE_META_ID}`;

const seoRouteMetaPlugin = () => ({
    name: "evalcue-seo-route-meta",
    resolveId(id) {
        return id === SEO_ROUTE_META_ID ? RESOLVED_SEO_ROUTE_META_ID : null;
    },
    load(id) {
        if (id !== RESOLVED_SEO_ROUTE_META_ID) return null;
        const searchRoutes = Object.fromEntries(SEARCH_LANDING_PAGES.map((page) => [
            page.path,
            { title: page.metaTitle, description: page.description, schema: page.schema || "WebPage" },
        ]));
        const resourceRoutes = Object.fromEntries(PRODUCT_RESOURCE_PAGES.map((page) => [
            resourcePathFor(page),
            { title: page.metaTitle, description: page.description, schema: "TechArticle" },
        ]));
        return [
            `export const SEARCH_ROUTE_META = ${JSON.stringify(searchRoutes)};`,
            `export const RESOURCE_ROUTE_META = ${JSON.stringify(resourceRoutes)};`,
        ].join("\n");
    },
});

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");
    const publicOrigin = normalizePublicOrigin(env.VITE_PUBLIC_ORIGIN);
    const surfaceOrigins = {
        practice: normalizePublicOrigin(env.VITE_PRACTICE_ORIGIN),
        hiring: normalizePublicOrigin(env.VITE_HIRING_ORIGIN),
    };
    const appSurface = ["landing", "practice", "hiring"].includes(env.VITE_APP_SURFACE)
        ? env.VITE_APP_SURFACE
        : null;
    const indexableRoutes = appSurface
        ? INDEXABLE_ROUTES_BY_SURFACE[appSurface]
        : ALL_INDEXABLE_ROUTES;
    const sitemapOrigin = appSurface ? originForSurface(appSurface, publicOrigin, surfaceOrigins) : publicOrigin;

    return {
        test: {
            environment: "jsdom",
            globals: true,
            exclude: ["e2e/**", "node_modules/**"],
        },
        plugins: [react(), seoRouteMetaPlugin(), seoFilesPlugin(sitemapOrigin, indexableRoutes, surfaceOrigins, appSurface)],
        build: {
            manifest: true,
            rollupOptions: {
                output: {
                    manualChunks(id) {
                        // Heavy interview libraries are already behind lazy routes/components.
                        // Forcing them into named chunks can pull shared entry dependencies into
                        // those chunks and make unrelated pages preload the heavy libraries.
                        if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return "react";
                        // Styling runtime and HTTP client are needed on every page and change rarely, so
                        // keep them in separate long-cached chunks that download in parallel with the entry.
                        if (/node_modules\/(@emotion|@mui\/(system|utils|styled-engine|private-theming)|@popperjs|react-transition-group|stylis|react-is)\//.test(id)) return "mui-core";
                        if (/node_modules\/axios\//.test(id)) return "axios";

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
