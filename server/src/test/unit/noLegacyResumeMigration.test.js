import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

describe("resume stabilization scope", () => {
    it("does not introduce a legacy resume migration script", () => {
        const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
        const scriptsDir = path.join(root, "server/scripts");
        const files = fs.existsSync(scriptsDir) ? fs.readdirSync(scriptsDir) : [];
        expect(files.some((name) => /migrat.*resume|resume.*migrat/i.test(name))).toBe(false);
    });
});
