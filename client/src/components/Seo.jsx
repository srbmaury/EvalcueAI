import { useEffect } from "react";
import { deploymentOrigins } from "../utils/deploymentSurface";

const configuredOrigin = (() => {
    try {
        const value = String(import.meta.env.VITE_PUBLIC_ORIGIN || "").trim();
        return value ? new URL(value).origin : "";
    } catch {
        return "";
    }
})();

const absoluteUrl = (path = "/") => {
    const origins = deploymentOrigins();
    const pathname = window.location.pathname;
    const surfaceOrigin = pathname === "/hire" || pathname.startsWith("/hire/")
        ? origins.hiring
        : pathname === "/practice" || pathname.startsWith("/practice/")
            ? origins.practice
            : origins.landing;
    const origin = surfaceOrigin || configuredOrigin || window.location.origin;
    return new URL(path || "/", `${origin}/`).href;
};

export default function Seo({ title, description, canonicalPath = "/", structuredData, imagePath = "", type = "website" }) {
    useEffect(() => {
        const previousTitle = document.title;
        document.title = title;

        const ensureMeta = (selector, attributes) => {
            let element = document.head.querySelector(selector);
            const created = !element;
            if (!element) {
                element = document.createElement("meta");
                document.head.appendChild(element);
            }
            const previous = {};
            Object.keys(attributes).forEach((key) => { previous[key] = element.getAttribute(key); });
            Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
            return { element, created, previous };
        };

        const canonicalUrl = absoluteUrl(canonicalPath);
        const metadata = [
            ensureMeta('meta[name="description"]', { name: "description", content: description }),
            ensureMeta('meta[property="og:title"]', { property: "og:title", content: title }),
            ensureMeta('meta[property="og:description"]', { property: "og:description", content: description }),
            ensureMeta('meta[property="og:type"]', { property: "og:type", content: type }),
            ensureMeta('meta[property="og:url"]', { property: "og:url", content: canonicalUrl }),
            ensureMeta('meta[property="og:site_name"]', { property: "og:site_name", content: "EvalcueAI" }),
            ensureMeta('meta[property="og:locale"]', { property: "og:locale", content: "en_US" }),
            ensureMeta('meta[name="twitter:card"]', { name: "twitter:card", content: imagePath ? "summary_large_image" : "summary" }),
            ensureMeta('meta[name="twitter:title"]', { name: "twitter:title", content: title }),
            ensureMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description }),
        ];

        if (imagePath) {
            const imageUrl = absoluteUrl(imagePath);
            metadata.push(
                ensureMeta('meta[property="og:image"]', { property: "og:image", content: imageUrl }),
                ensureMeta('meta[name="twitter:image"]', { name: "twitter:image", content: imageUrl }),
            );
        }

        let canonical = document.head.querySelector('link[rel="canonical"]');
        const canonicalCreated = !canonical;
        const previousCanonicalHref = canonical?.getAttribute("href") ?? null;
        if (!canonical) {
            canonical = document.createElement("link");
            canonical.rel = "canonical";
            document.head.appendChild(canonical);
        }
        canonical.href = canonicalUrl;

        let jsonLd;
        if (structuredData) {
            jsonLd = document.createElement("script");
            jsonLd.type = "application/ld+json";
            jsonLd.dataset.evalcueSeo = "true";
            jsonLd.textContent = JSON.stringify(structuredData);
            document.head.appendChild(jsonLd);
        }

        return () => {
            document.title = previousTitle;
            metadata.forEach(({ element, created, previous }) => {
                if (created) {
                    element.remove();
                    return;
                }
                Object.entries(previous).forEach(([key, value]) => {
                    if (value == null) element.removeAttribute(key);
                    else element.setAttribute(key, value);
                });
            });
            if (canonicalCreated) canonical.remove();
            else if (previousCanonicalHref == null) canonical.removeAttribute("href");
            else canonical.setAttribute("href", previousCanonicalHref);
            if (jsonLd) jsonLd.remove();
        };
    }, [canonicalPath, description, imagePath, structuredData, title, type]);

    return null;
}
