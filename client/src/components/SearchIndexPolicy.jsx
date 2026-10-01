/* eslint-disable react-refresh/only-export-components */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { RESOURCE_ROUTE_META, SEARCH_ROUTE_META } from "virtual:seo-route-meta";

export const isIndexablePath = (pathname) => (
    pathname === "/" ||
    pathname === "/practice" ||
    pathname === "/hire" ||
    pathname === "/plans" ||
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname === "/docs" ||
    pathname.startsWith("/docs/") ||
    Object.hasOwn(RESOURCE_ROUTE_META, pathname) ||
    Object.hasOwn(SEARCH_ROUTE_META, pathname)
);

export default function SearchIndexPolicy() {
    const { pathname } = useLocation();

    useEffect(() => {
        let element = document.head.querySelector('meta[name="robots"]');
        const created = !element;
        const previous = element?.getAttribute("content") ?? null;
        if (!element) {
            element = document.createElement("meta");
            element.name = "robots";
            document.head.appendChild(element);
        }
        element.content = isIndexablePath(pathname) ? "index,follow" : "noindex,nofollow";

        return () => {
            if (created) element.remove();
            else if (previous == null) element.removeAttribute("content");
            else element.setAttribute("content", previous);
        };
    }, [pathname]);

    return null;
}
