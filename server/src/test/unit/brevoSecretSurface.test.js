import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const routeSource = fs.readFileSync(path.resolve(process.cwd(), "src/routes/emailWebhookRoutes.js"), "utf8");

describe("Brevo webhook authentication surface", () => {
    it("does not accept the shared secret from a query string", () => {
        expect(routeSource).toContain('req.get("x-evalcue-webhook-secret")');
        expect(routeSource).not.toContain("req.query.secret");
    });
});
