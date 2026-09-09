import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "..");

describe("Netlify security headers", () => {
    it("denies framing and defines a CSP", () => {
        const config = fs.readFileSync(path.join(root, "netlify.toml"), "utf8");
        expect(config).toContain('X-Frame-Options = "DENY"');
        expect(config).toContain("Content-Security-Policy");
        expect(config).toContain("frame-ancestors 'none'");
        expect(config).toContain("object-src 'none'");
    });
});
