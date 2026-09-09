import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

describe("runtime public configuration", () => {
    it("keeps browser-safe auth identifiers server-owned", () => {
        const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
        const authRoutes = fs.readFileSync(path.join(root, "server/src/routes/authRoutes.js"), "utf8");
        expect(authRoutes).toContain('/public-config');
        expect(authRoutes).toContain("GOOGLE_CLIENT_ID");
        expect(authRoutes).toContain("CAPTCHA_SITE_KEY");
    });
});
