import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

// Regression test for a real bug: the client called trackEvent("resume_generation_completed")
// from the new resume-generator page, but the server's POST /api/events zod schema (a
// hardcoded z.enum(...) allowlist) was never updated to include that event name. Every
// unit/e2e test mocked or ignored this route, so it only surfaced as a silent 400 in a
// live browser check. This test greps the client source for every literal trackEvent("...")
// call site and checks each one against the server's allowlist, so a future new event name
// added on the client without a matching server-side enum entry fails fast here instead.
describe("POST /api/events allowlist stays in sync with client trackEvent(...) call sites", () => {
    // The schema isn't exported directly, so the enum list is re-derived from the route
    // source text rather than re-implementing zod validation here.
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const routeSource = fs.readFileSync(path.join(__dirname, "../../routes/productEventRoutes.js"), "utf8");
    const enumMatch = routeSource.match(/z\.enum\(\[([^\]]+)\]\)/);
    const allowedEvents = enumMatch[1].match(/"([^"]+)"/g).map((s) => s.slice(1, -1));

    const clientSrcDir = path.join(__dirname, "../../../../client/src");
    const clientEventNames = new Set();
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(fullPath);
            else if (/\.(js|jsx)$/.test(entry.name)) {
                const source = fs.readFileSync(fullPath, "utf8");
                for (const match of source.matchAll(/trackEvent\(\s*"([a-zA-Z_]+)"/g)) clientEventNames.add(match[1]);
            }
        }
    };
    walk(clientSrcDir);

    it("finds at least one trackEvent(...) call site in the client (sanity-checks this test isn't vacuous)", () => {
        expect(clientEventNames.size).toBeGreaterThan(0);
    });

    it.each([...clientEventNames])("client event \"%s\" is present in the server allowlist", (eventName) => {
        expect(allowedEvents).toContain(eventName);
    });
});
