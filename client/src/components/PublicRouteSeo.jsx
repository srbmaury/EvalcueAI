/* eslint-disable react-refresh/only-export-components */
import { useLocation } from "react-router-dom";
import Seo from "./Seo";
import { RESOURCE_ROUTE_META, SEARCH_ROUTE_META } from "virtual:seo-route-meta";
import { deploymentOrigins } from "../utils/deploymentSurface";
import { BRAND_NAME, organizationSchema, publisherRef, softwareApplicationSchema } from "../utils/brandEntity";
import { PUBLIC_ROUTE_META as ROUTES } from "../utils/publicRouteMeta";

export const seoForPath = (pathname) => {
    if (ROUTES[pathname]) return { ...ROUTES[pathname], canonicalPath: pathname };
    if (SEARCH_ROUTE_META[pathname]) return { ...SEARCH_ROUTE_META[pathname], canonicalPath: pathname };
    if (RESOURCE_ROUTE_META[pathname]) return { ...RESOURCE_ROUTE_META[pathname], canonicalPath: pathname };
    if (pathname.startsWith("/docs/")) return { ...ROUTES["/docs"], canonicalPath: pathname };
    return null;
};

const structuredDataFor = (config, canonicalUrl) => {
    const common = {
        "@context": "https://schema.org",
        name: config.title,
        description: config.description,
        url: canonicalUrl,
    };
    if (config.schema === "EducationalApplication" || config.schema === "BusinessApplication") {
        return {
            ...common,
            "@type": "SoftwareApplication",
            applicationCategory: config.schema,
            operatingSystem: "Web",
            publisher: publisherRef(),
        };
    }
    if (config.schema === "WebSite") {
        return {
            "@context": "https://schema.org",
            "@graph": [
                { "@type": "WebSite", name: BRAND_NAME, alternateName: "Evalcue", description: config.description, url: canonicalUrl, publisher: publisherRef() },
                organizationSchema(),
                softwareApplicationSchema(),
            ],
        };
    }
    return { ...common, "@type": config.schema || "WebPage", publisher: publisherRef() };
};

export default function PublicRouteSeo() {
    const { pathname } = useLocation();
    const config = seoForPath(pathname);
    if (!config) return null;
    const origins = deploymentOrigins();
    const configuredOrigin = String(import.meta.env.VITE_PUBLIC_ORIGIN || "").trim();
    const isHiringRoute = pathname === "/hire" || pathname.startsWith("/hire/");
    const isPracticeRoute = pathname === "/practice" || pathname.startsWith("/practice/");
    const defaultOrigin = isHiringRoute
        ? origins.hiring
        : isPracticeRoute
            ? origins.practice
            : origins.landing;
    let origin = defaultOrigin || window.location.origin;
    // Ignore a landing-only override for a public route hosted on another production surface.
    if (configuredOrigin && !(isHiringRoute && origins.hiring) && !(isPracticeRoute && origins.practice)) {
        try { origin = new URL(configuredOrigin).origin; } catch { /* use surface default */ }
    }
    const canonicalUrl = new URL(config.canonicalPath, `${origin}/`).href;
    return (
        <Seo
            title={config.title}
            description={config.description}
            canonicalPath={config.canonicalPath}
            structuredData={structuredDataFor(config, canonicalUrl)}
        />
    );
}
